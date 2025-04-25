import type { Probot, ApplicationFunctionOptions } from "probot";
import { failComment, postComment, reactToComment } from "./comment.js";
import { handleFoldCommand } from "./fold-command.js";
import { handleHelpCommand } from "./help-command.js";
import { handleSquashCommand } from "./squash-command.js";
import {
	type CommandSuccessResponse,
	isCommentBotCommand,
	parseCommand,
} from "./utils.js";

export default (app: Probot, { getRouter }: ApplicationFunctionOptions) => {
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

			await reactToComment(context);

			switch (baseCommand) {
				case "squash":
					result = await handleSquashCommand(context, subCommand);
					break;
				case "fold":
					result = await handleFoldCommand(context, subCommand);
					break;
				case "help":
					result = handleHelpCommand();
					break;
				default:
					throw new Error(
						`Could not understand command: \`${baseCommand} ${subCommand}\``,
					);
			}

			for (const { message, options } of result) {
				await postComment(context, message, options);
			}
		} catch (error) {
			await reactToComment(context, "confused");
			await failComment(context, error);

			throw error;
		}
	});

	const router = getRouter?.();

	if (!router) {
		return;
	}

	router.get("/health", (_, res) => {
		res.status(200).send("UP");
	});
};
