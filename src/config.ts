import type { Context } from "probot";

export interface SquashBotConfig {
	enabled: boolean;
	/*
	 * By default, the default branch of the repository is used as the trunk. Set this to another branch name to override
	 */
	mainBranch?: string;
	/*
	 * Set `singleComment` to `true` if you would prefer the bot to post 1 comment and make edits to it with new commands
	 */
	singleComment: boolean;
	/*
	 * By default, the `fold` command will abort if any PR to be processed is marked as not ready to merge.
	 * If you would like to override this check, set to `true`
	 */
	skipReadyCheck: boolean;
}

const defaultOptions = {
	enabled: true,
	singleComment: false,
	skipReadyCheck: false,
} satisfies SquashBotConfig;

export async function getConfig(
	context: Context<"issue_comment">,
): Promise<SquashBotConfig> {
	const config = await context.config<SquashBotConfig>("pr-stacker.yml", {
		enabled: true,
		singleComment: false,
		skipReadyCheck: false,
	});

	return config ?? defaultOptions;
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
