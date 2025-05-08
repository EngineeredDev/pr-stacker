import type { Probot, ApplicationFunctionOptions } from "probot";
import {
	failComment,
	postComment,
	postStackOutputComment,
	reactToComment,
} from "./comment.js";
import { handleFoldCommand } from "./fold-command.js";
import { handleHelpCommand } from "./help-command.js";
import { handleSquashCommand } from "./squash-command.js";
import {
	botName,
	type CommandSuccessResponse,
	isCommentBotCommand,
	parseCommand,
} from "./utils.js";
import { getPRStack } from "./pr-graph.js";
import { getConfig } from "./config.js";

export default (app: Probot, { getRouter }: ApplicationFunctionOptions) => {
	app.on(
		[
			"pull_request.edited",
			"pull_request.opened",
			"pull_request.reopened",
			"pull_request.synchronize",
		],
		async (context) => {
			// TODO: maybe we need to keep state of current updating stacks.
			// If someone updates a stack and pushes each branch in rapid succession,
			// a webhook for each PR is sent and sometimes multiple comments are posted.
			const config = await getConfig(context);

			if (!config.stackTreeComment.enable) {
				return;
			}
			// skip if we were the ones who initiated the update
			if (context.isBot && context.payload.sender.login === botName) {
				return;
			}

			const currentPrNumber = context.payload.number;
			const stack = await getPRStack(currentPrNumber, context);

			if (config.stackTreeComment.skipSinglePR && stack.length === 1) {
				return;
			}

			// update the comment for each PR in the stack
			for (const pr of stack) {
				await postStackOutputComment(pr.prNumber, stack, context);

				// wait around for 2 seconds for Github to process
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		},
	);

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
