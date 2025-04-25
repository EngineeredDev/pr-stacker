import type { Context } from "probot";

export interface SquashBotConfig {
	enabled: boolean;
	mainBranch?: string;
	/*
	 * Set `singleComment` to `true` if you would prefer the bot to post 1 comment and make edits to it with new commands
	 */
	singleComment?: boolean;
}

export async function getConfig(context: Context<"issue_comment">) {
	return await context.config<SquashBotConfig>("pr-stacker.yml", {
		enabled: true,
		singleComment: false,
	});
}

export async function getMainBranch(context: Context<"issue_comment">) {
	const { octokit } = context;

	const config = await getConfig(context);

	if (config?.mainBranch) {
		return config.mainBranch;
	}

	const {
		data: { default_branch: defaultBranch },
	} = await octokit.rest.repos.get(context.repo());

	return defaultBranch;
}
