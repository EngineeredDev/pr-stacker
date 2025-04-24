import type { Probot } from "probot";
import { handleSquashCommand } from "./squash-command.js";
import { failComment, postComment, reactToComment } from "./comment.js";
import {
	type CommandSuccessResponse,
	isCommentBotCommand,
	parseCommand,
} from "./utils.js";
import { handleFoldCommand } from "./fold-command.js";

export default (app: Probot) => {
	app.on("issue_comment.created", async (context) => {
		if (context.isBot || !context.payload.issue.pull_request) {
			return;
		}

		const commentContent = context.payload.comment.body.trim();

		if (!isCommentBotCommand(commentContent)) {
			return;
		}

		const [baseCommand, subCommand] = parseCommand(commentContent);

		let result: CommandSuccessResponse[] = [];

		try {
			if (!baseCommand) {
				throw new Error(`The command \`${baseCommand}\` was not recognized.`);
			}

			reactToComment(context);

			switch (baseCommand) {
				case "squash":
					result = await handleSquashCommand(context, subCommand);
					break;
				case "fold":
					result = await handleFoldCommand(context, subCommand);
					break;
				default:
					throw new Error(
						`Could not understand command: \`${baseCommand} ${subCommand}\``,
					);
			}

			for (const { message, options } of result) {
				postComment(context, message, options);
			}
		} catch (error) {
			reactToComment(context, "confused");
			failComment(context, error);

			throw error;
		}
	});
};
