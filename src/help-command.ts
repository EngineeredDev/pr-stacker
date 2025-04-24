import { type CommandSuccessResponse, baseBotCommand } from "./utils.js";

export function handleHelpCommand(): CommandSuccessResponse[] {
	return [
		{
			message: `
- \`${baseBotCommand} fold\`: Folds a stack of PR's from this PR down
- \`${baseBotCommand} squash\`: Squashes each PR in the stack to one commit using the PR title and description from this PR and down`,
		},
	];
}
