import type { PostCommentOverrideOptions } from "./comment.js";

export const botName = "pr-stacker[bot]";
export const baseBotCommand = "/stackbot";

export type Command = "squash" | "fold" | "help";
export type SubCommand = "down" | "all" | "only";

export interface CommandSuccessResponse {
	message: string;
	options?: PostCommentOverrideOptions;
}

export function isCommentBotCommand(comment: string) {
	return comment.trim().startsWith(baseBotCommand);
}

export function isCommand(command: string): command is Command {
	return ["squash", "fold", "help"].includes(command);
}

export function isSubCommand(
	command: string | undefined,
): command is SubCommand {
	return (
		command === undefined ||
		command === "all" ||
		command === "down" ||
		command === "only"
	);
}

export function parseCommand(message: string) {
	const commandArray = message.split(" ");

	if (commandArray.length < 2 || commandArray[0].trim() !== baseBotCommand) {
		return [] as const;
	}

	const baseCommand = commandArray[1];

	if (!isCommand(baseCommand)) {
		return [] as const;
	}

	const subCommand = commandArray.at(2);

	if (!isSubCommand(subCommand)) {
		return [] as const;
	}

	return [baseCommand, subCommand] as const;
}

export function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Unknown error";
}
