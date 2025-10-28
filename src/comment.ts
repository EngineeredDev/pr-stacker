import type { Context } from "probot";
import { getConfig } from "./config.js";
import { getContextLogger } from "./logger.js";
import type { PullRequest } from "./pull-request.js";
import { botName, getErrorMessage } from "./utils.js";

const STACK_METADATA = "<!-- pr-stack -->";

export interface PostCommentOverrideOptions {
	owner?: string;
	repo?: string;
	issue_number?: number;
}

export async function reactToComment(
	context: Context<"issue_comment">,
	reaction: "rocket" | "confused" = "rocket",
) {
	await context.octokit.reactions.createForIssueComment({
		owner: context.payload.repository.owner.login,
		repo: context.payload.repository.name,
		comment_id: context.payload.comment.id,
		content: reaction,
	});
}

export async function postComment(
	context: Context<"issue_comment">,
	body: string,
	overrides?: PostCommentOverrideOptions,
) {
	const config = await getConfig(context);
	const params = {
		owner: context.payload.repository.owner.login,
		repo: context.payload.repository.name,
		issue_number: context.payload.issue.number,
		...overrides,
	};

	if (config?.singleComment) {
		// Find existing bot comment
		const { data: comments } =
			await context.octokit.issues.listComments(params);
		const existingComment = comments.find(
			(comment) => comment.user?.login === botName,
		);

		if (existingComment) {
			// Edit existing comment
			return await context.octokit.issues.updateComment({
				...params,
				comment_id: existingComment.id,
				body,
			});
		}
	}

	return await context.octokit.issues.createComment({
		...params,
		body,
	});
}

export async function failComment(context: Context, error: unknown) {
	const log = getContextLogger(context);
	log.error({ error: getErrorMessage(error) }, "Error processing command");

	await postComment(context, `❌ ${getErrorMessage(error)}`);
}

export async function postStackOutputComment(
	currentPrNumber: number,
	stack: PullRequest[],
	context: Context<"pull_request">,
) {
	const params = {
		owner: context.payload.repository.owner.login,
		repo: context.payload.repository.name,
		issue_number: currentPrNumber,
	};

	try {
		const { status } = await context.octokit.pulls.checkIfMerged({
			...params,
			pull_number: params.issue_number,
		});

		// don't update a merged pull request
		if (status === 204) {
			return Promise.resolve();
		}
	} catch (e) {
		// this can throw if the PR was just created. Can assume it hasn't been merged
	}

	const body = await getStackOutput(currentPrNumber, stack);

	const { data: comments } = await context.octokit.issues.listComments(params);
	const existingComment = comments.find((comment) =>
		comment.body?.includes(STACK_METADATA),
	);

	if (existingComment) {
		return await context.octokit.issues.updateComment({
			...params,
			comment_id: existingComment.id,
			body,
		});
	}

	return await context.octokit.issues.createComment({
		...params,
		body,
	});
}

async function getStackOutput(currentPrNumber: number, stack: PullRequest[]) {
	const lines: string[] = [STACK_METADATA];

	for (let i = 0; i < stack.length; i++) {
		const pr = stack[i];

		const tabSize = i * 2;
		const indentation = new Array(tabSize).fill(" ").join("");

		let line = indentation;

		line += `- #${pr.prNumber}`;

		if (pr.prNumber === currentPrNumber) {
			line += " ◀";
		}

		lines.push(line);
	}

	return lines.join("\n");
}
