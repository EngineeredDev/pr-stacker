import type { Context } from "probot";
import { getContextLogger } from "./logger.js";
import { type CommandSuccessResponse, baseBotCommand } from "./utils.js";

export function handleHelpCommand(
	context: Context<"issue_comment.created">,
): CommandSuccessResponse[] {
	const log = getContextLogger(context);

	log.info("Help command requested");

	return [
		{
			message: `
- \`${baseBotCommand} fold\`: Folds a stack of PR's from this PR down
- \`${baseBotCommand} squash\`: Squashes each PR in the stack to one commit using the PR title and description from this PR and down`,
		},
	];
}
