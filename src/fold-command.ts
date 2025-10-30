import type { Context } from "probot";
import { getConfig, getMainBranch } from "./config.js";
import { ExpectedError, ValidationError } from "./errors.js";
import { getContextLogger } from "./logger.js";
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
		const stack = await getPRStack(currentPrNumber, context);

		// Step 2: Determine which PRs to process based on subCommand
		const prsToProcess = getRelevantPRsFromStack(
			currentPrNumber,
			stack,
			subCommand,
		);

		const config = await getConfig(context);

		// Step 3: Check if all PRs are ready to be folded
		if (!config.skipReadyCheck) {
			const readinessChecks = await Promise.all(
				prsToProcess.map((pr) =>
					checkMergeReadiness(pr, context, {
						// TODO: not really implemented right now. We always squash by default after this. Maybe that should be configurable?
						validateCommits: false,
					}),
				),
			);

			const unreadyPRs = prsToProcess.filter((_, i) => !readinessChecks[i]);
			if (unreadyPRs.length > 0) {
				throw new ValidationError(
					`The following PRs are not ready to be folded:\n ${unreadyPRs
						.map((pr) => `- #${pr.prNumber}`)
						.join("\n")}`,
				);
			}
		}

		// Step 4: Squash each PR
		await Promise.all(prsToProcess.map((pr) => squashPR(context, pr.prNumber)));

		// Wait for Github to process all of the squashes
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Step 5: Fold the stack
		const responses = await foldStackDownwards(context, prsToProcess);

		// Step 6: If folded from the middle, fix the next PR to point to trunk and rebase its head
		if (stack.length > prsToProcess.length) {
			const nextPR = stack[prsToProcess.length];
			const repo = context.payload.repository.name;
			const owner = context.payload.repository.owner.login;
			const trunkRef = stack[0].baseRef;

			const log = getContextLogger(context);
			log.info(
				{
					nextPR: nextPR.prNumber,
					trunkRef,
				},
				"Setting the next PR in the stack to have base trunk and rebasing its head",
			);

			await context.octokit.pulls.update({
				owner,
				repo,
				pull_number: nextPR.prNumber,
				base: trunkRef,
			});

			// Get the current main branch SHA (after the fold operation)
			const { data: mainRef } = await context.octokit.git.getRef({
				owner,
				repo,
				ref: `heads/${trunkRef}`,
			});
			const mainSha = mainRef.object.sha;

			// Get the next PR's current head commit
			const { data: nextBranchData } = await context.octokit.repos.getBranch({
				owner,
				repo,
				branch: nextPR.headRef,
			});

			// Get details of the next PR's head commit to preserve author info
			const { data: nextHeadCommit } = await context.octokit.git.getCommit({
				owner,
				repo,
				commit_sha: nextBranchData.commit.sha,
			});

			// Create a new commit based on trunk with the same tree
			// This ensures the PR only shows its own changes, not the folded PRs
			const { data: newHeadCommit } = await context.octokit.git.createCommit({
				owner,
				repo,
				message: nextHeadCommit.message,
				tree: nextHeadCommit.tree.sha,
				parents: [mainSha],
				author: nextHeadCommit.author,
				committer: nextHeadCommit.committer,
			});

			// Force update the next PR's head branch to point to this new commit
			await context.octokit.git.updateRef({
				owner,
				repo,
				ref: `heads/${nextPR.headRef}`,
				sha: newHeadCommit.sha,
				force: true,
			});

			log.info(
				{
					prNumber: nextPR.prNumber,
					headRef: nextPR.headRef,
					trunkRef,
				},
				"Rebased PR head branch onto trunk",
			);
		}

		return responses;
	} catch (error) {
		// Preserve ExpectedError types (ValidationError, etc.) when wrapping
		if (error instanceof ExpectedError) {
			// Re-wrap with the same error type to preserve the expected error classification
			const WrappedErrorClass = error.constructor as new (
				message: string,
			) => ExpectedError;
			throw new WrappedErrorClass(
				`Failed to fold stack: ${getErrorMessage(error)}`,
			);
		}
		throw new Error(`Failed to fold stack: ${getErrorMessage(error)}`);
	}
}

async function foldStackDownwards(
	context: Context<"issue_comment.created">,
	stack: PullRequest[],
): Promise<CommandSuccessResponse[]> {
	const log = getContextLogger(context);
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

	// Process each PR in the stack, in order from bottom to top
	for (let i = 0; i < stack.length; i++) {
		const currentPR = stack[i];
		log.info(
			{
				prNumber: currentPR.prNumber,
				headRef: currentPR.headRef,
				stackPosition: `${i + 1}/${stack.length}`,
			},
			"Processing PR in stack",
		);

		// Get only the latest commit (the squashed one) from the branch
		const { data: branchData } = await context.octokit.repos.getBranch({
			owner,
			repo,
			branch: currentPR.headRef,
		});

		const commitSha = branchData.commit.sha;

		// Update the PR's head branch to be based on our temp branch
		// This is crucial: we're preserving the original commit, but changing its base
		if (i === 0) {
			// For the first PR, we update the temp branch to match PR's head
			await context.octokit.git.updateRef({
				owner,
				repo,
				ref: `heads/${tempBranchName}`,
				sha: commitSha,
				force: true,
			});

			currentTempBranchSha = commitSha;
		} else {
			// For subsequent PRs, we need to get the commit details and create
			// a new commit with the same changes but based on our updated temp branch
			const { data: commitData } = await context.octokit.git.getCommit({
				owner,
				repo,
				commit_sha: commitSha,
			});

			// Create a new commit with the current temp branch as parent
			const { data: newCommit } = await context.octokit.git.createCommit({
				owner,
				repo,
				message: commitData.message,
				tree: commitData.tree.sha,
				parents: [currentTempBranchSha],
				author: commitData.author,
				committer: commitData.committer,
			});

			// Update the PR's head branch to point to this new commit
			await context.octokit.git.updateRef({
				owner,
				repo,
				ref: `heads/${currentPR.headRef}`,
				sha: newCommit.sha,
				force: true,
			});

			// Also update our temp branch
			await context.octokit.git.updateRef({
				owner,
				repo,
				ref: `heads/${tempBranchName}`,
				sha: newCommit.sha,
				force: true,
			});

			currentTempBranchSha = newCommit.sha;
		}

		// If there's a next PR in the stack, update its base to point to our temp branch
		if (i < stack.length - 1) {
			const nextPR = stack[i + 1];
			log.info(
				{
					prNumber: nextPR.prNumber,
					oldBase: nextPR.baseRef,
					newBase: tempBranchName,
				},
				"Changing base of PR to temp branch",
			);

			await context.octokit.pulls.update({
				owner,
				repo,
				pull_number: nextPR.prNumber,
				base: tempBranchName,
			});

			// Get the latest commit from the next PR's head branch
			const { data: nextBranchData } = await context.octokit.repos.getBranch({
				owner,
				repo,
				branch: nextPR.headRef,
			});

			// Get details of the next PR's head commit to preserve author info
			const { data: nextHeadCommit } = await context.octokit.git.getCommit({
				owner,
				repo,
				commit_sha: nextBranchData.commit.sha,
			});

			// Create a new commit on top of our temp branch that represents just the changes from PR B
			const { data: newHeadCommit } = await context.octokit.git.createCommit({
				owner,
				repo,
				message: nextHeadCommit.message,
				tree: nextHeadCommit.tree.sha, // Use the tree from PR B's head
				parents: [currentTempBranchSha],
				author: nextHeadCommit.author,
				committer: nextHeadCommit.committer,
			});

			// Force update the next PR's head branch to point to this new commit
			await context.octokit.git.updateRef({
				owner,
				repo,
				ref: `heads/${nextPR.headRef}`,
				sha: newHeadCommit.sha,
				force: true,
			});

			// Wait briefly for GitHub to process
			await new Promise((resolve) => setTimeout(resolve, 2000));
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

	if (currentMainSha !== mainSha) {
		log.info(
			{
				oldMainSha: mainSha.substring(0, 7),
				newMainSha: currentMainSha.substring(0, 7),
			},
			"Main branch moved during operation, rebasing folded changes on top of new main",
		);

		// Get the commits that are unique to our temp branch (our folded stack)
		const { data: comparison } = await context.octokit.repos.compareCommits({
			owner,
			repo,
			base: mainSha, // Original main SHA when we started
			head: currentTempBranchSha, // Our temp branch head
		});

		// Start from the current main branch
		let rebasedSha = currentMainSha;

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
				parents: [rebasedSha],
				author: commitData.author,
				committer: commitData.committer,
			});

			// Update our rebase pointer
			rebasedSha = newCommit.sha;
		}

		// Update currentTempBranchSha to our rebased state
		currentTempBranchSha = rebasedSha;
	}

	// Update main to point to the temp branch state
	await context.octokit.git.updateRef({
		owner,
		repo,
		ref: `heads/${mainBranch}`,
		sha: currentTempBranchSha,
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
