import type { Context } from "probot";
import { baseBotCommand, type CommandSuccessResponse } from "./utils.js";

export function handleHelpCommand(
	context: Context<"issue_comment.created">,
): CommandSuccessResponse[] {
	return [
		{
			message: `
        - \`${baseBotCommand}\` \`fold\`: Folds a stack of PR's from this PR down
        - \`${baseBotCommand}\` \`squash\`: Squashes each PR in the stack to one commit using the PR title and description from this PR and down`,
		},
	];
}
