import type { Context } from "probot";
import { getConfig, getMainBranch } from "./config.js";
import { getPRStack, getRelevantPRsFromStack } from "./pr-graph.js";
import { type PullRequest, checkMergeReadiness } from "./pull-request.js";
import { squashPR } from "./squash-command.js";
import {
	type CommandSuccessResponse,
	type SubCommand,
	getErrorMessage,
} from "./utils.js";

export async function handleFoldCommand(
	context: Context<"issue_comment.created">,
	subCommand: SubCommand = "down",
): Promise<CommandSuccessResponse[]> {
	try {
		// Step 1: Get the PR stack
		const currentPrNumber = context.payload.issue.number;
		const stack = await getPRStack(context);

		// Step 2: Determine which PRs to process based on subCommand
		const prsToProcess = getRelevantPRsFromStack(
			currentPrNumber,
			stack,
			subCommand,
		);

		const config = await getConfig(context);

		// Step 3: Check if all PRs are ready to be folded
		const readinessChecks = await Promise.all(
			prsToProcess.map((pr) =>
				checkMergeReadiness(pr, context, {
					validateCommits: config.skipReadyCheck,
				}),
			),
		);

		const unreadyPRs = prsToProcess.filter((_, i) => !readinessChecks[i]);
		if (unreadyPRs.length > 0) {
			throw new Error(
				`The following PRs are not ready to be folded:\n ${unreadyPRs
					.map((pr) => `- #${pr.prNumber}`)
					.join("\n")}`,
			);
		}

		// Step 4: Squash each PR
		await Promise.all(prsToProcess.map((pr) => squashPR(context, pr.prNumber)));

		// Wait for Github to process all of the squashes
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Step 5: Fold the stack
		const responses = await foldStackDownwards(context, prsToProcess);

		// Step 6: If folded from the middle, fix the next PR to point to trunk
		if (stack.length > prsToProcess.length) {
			const nextPR = stack[prsToProcess.length];
			const repo = context.payload.repository.name;
			const owner = context.payload.repository.owner.login;
			const trunkRef = stack[0].baseRef;

			console.log(`Setting the next PR in the stack to have base ${trunkRef}`);

			await context.octokit.pulls.update({
				owner,
				repo,
				pull_number: nextPR.prNumber,
				base: trunkRef,
			});
		}

		return responses;
	} catch (error) {
		throw new Error(`Failed to fold stack: ${getErrorMessage(error)}`);
	}
}

async function foldStackDownwards(
	context: Context<"issue_comment.created">,
	stack: PullRequest[],
): Promise<CommandSuccessResponse[]> {
	const repo = context.payload.repository.name;
	const owner = context.payload.repository.owner.login;
	const responses: CommandSuccessResponse[] = [];

	if (stack.length === 0) return [];

	// Get the main branch reference
	const mainBranch = await getMainBranch(context);

	// Get the main branch SHA as our starting point
	const { data: mainRef } = await context.octokit.git.getRef({
		owner,
		repo,
		ref: `heads/${mainBranch}`,
	});
	const mainSha = mainRef.object.sha;

	// Create a temporary branch off of main
	const tempBranchName = `temp-fold-stack-${stack[0].prNumber}-${Date.now()}`;
	await context.octokit.git.createRef({
		owner,
		repo,
		ref: `refs/heads/${tempBranchName}`,
		sha: mainSha,
	});

	let currentTempBranchSha = mainSha;

	// First, change the base of the bottom-most PR to point to our temp branch
	const bottomPR = stack[0];
	console.log(
		`Changing base of PR #${bottomPR.prNumber} from ${bottomPR.baseRef} to ${tempBranchName}`,
	);

	await context.octokit.pulls.update({
		owner,
		repo,
		pull_number: bottomPR.prNumber,
		base: tempBranchName,
	});

	// Process each PR in the stack, in order from bottom to top
	for (let i = 0; i < stack.length; i++) {
		const currentPR = stack[i];
		console.log(`Processing PR #${currentPR.prNumber} (${currentPR.headRef})`);

		// Get only the latest commit (the squashed one) from the branch
		const { data: branchData } = await context.octokit.repos.getBranch({
			owner,
			repo,
			branch: currentPR.headRef,
		});

		// Apply just this single squashed commit
		await context.octokit.git.updateRef({
			owner,
			repo,
			ref: `heads/${tempBranchName}`,
			sha: branchData.commit.sha,
			force: true,
		});

		currentTempBranchSha = branchData.commit.sha;

		// If there's a next PR in the stack, update its base to point to our temp branch
		if (i < stack.length - 1) {
			const nextPR = stack[i + 1];
			console.log(
				`Changing base of PR #${nextPR.prNumber} from ${nextPR.baseRef} to ${tempBranchName}`,
			);

			await context.octokit.pulls.update({
				owner,
				repo,
				pull_number: nextPR.prNumber,
				base: tempBranchName,
			});
		}

		responses.push({
			message: `✅ Folded this PR into \`${mainBranch}\` as part of a fold operation started at PR #${stack.at(-1)?.prNumber}`,
			options: {
				issue_number: currentPR.prNumber,
			},
		});

		// Wait briefly for GitHub to process
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}

	// Get `mainBranch` again just in case another merge happened while this operation was happening
	const { data: currentMainRef } = await context.octokit.git.getRef({
		owner,
		repo,
		ref: `heads/${mainBranch}`,
	});
	const currentMainSha = currentMainRef.object.sha;

	// Get the commits that are unique to our temp branch (our folded stack)
	const { data: comparison } = await context.octokit.repos.compareCommits({
		owner,
		repo,
		base: currentMainSha,
		head: currentTempBranchSha,
	});

	// Start from the current main branch
	let newBase = currentMainSha;

	// Apply each unique commit on top of the current main
	for (const commit of comparison.commits) {
		const { data: commitData } = await context.octokit.git.getCommit({
			owner,
			repo,
			commit_sha: commit.sha,
		});

		// Create a new commit with the same changes but based on our new base
		const { data: newCommit } = await context.octokit.git.createCommit({
			owner,
			repo,
			message: commitData.message,
			tree: commitData.tree.sha,
			parents: [newBase],
			author: commitData.author,
			committer: commitData.committer,
		});

		// Update our base to this new commit
		newBase = newCommit.sha;
	}

	// Finally, update the main branch to point to our fully constructed temp branch
	await context.octokit.git.updateRef({
		owner,
		repo,
		ref: `heads/${mainBranch}`,
		sha: newBase,
		force: true,
	});

	// Clean up the temporary branch
	await context.octokit.git.deleteRef({
		owner,
		repo,
		ref: `heads/${tempBranchName}`,
	});

	return responses;
}
