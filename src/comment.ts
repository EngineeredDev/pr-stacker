import type { Context } from "probot";
import { botName, getErrorMessage } from "./utils.js";

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
	const params = {
		owner: context.payload.repository.owner.login,
		repo: context.payload.repository.name,
		issue_number: context.payload.issue.number,
		...overrides,
	};

	// Find existing bot comment
	const { data: comments } = await context.octokit.issues.listComments(params);
	const existingComment = comments.find(
		(comment) => comment.user?.login === botName,
	);

	if (existingComment) {
		// Edit existing comment
		await context.octokit.issues.updateComment({
			...params,
			comment_id: existingComment.id,
			body,
		});
	} else {
		// Create new comment
		await context.octokit.issues.createComment({
			...params,
			body,
		});
	}
}

export async function failComment(
	context: Context<"issue_comment">,
	error: unknown,
) {
	console.error("Error merging PR:", error);

	await postComment(context, `❌ ${getErrorMessage(error)}`);
}
