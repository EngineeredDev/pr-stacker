import type { Context } from "probot";

export interface SquashBotConfig {
	enabled: boolean;
	/*
	 * By default, the default branch of the repository is used as the trunk. Set this to another branch name to override
	 */
	mainBranch?: string;
	/*
	 * By default, only the creator of the PR can squash or fold PRs. Set this to false if you want to let anyone do this.
	 */
	restrictCommandsToOriginator: boolean;
	/*
	 * Set `singleComment` to `true` if you would prefer the bot to post 1 comment and make edits to it with new commands
	 */
	singleComment: boolean;
	/*
	 * By default, the `fold` command will abort if any PR to be processed is marked as not ready to merge.
	 * If you would like to override this check, set to `true`
	 */
	skipReadyCheck: boolean;

	/*
	 * By default, the bot will add a separate comment to each PR in a stack that displays the full stack for reference.
	 * To disable, set `stackTreeComment.enableStackTreeComment` to `false`
	 *
	 * By default, the bot will skip adding the tree comment for PR's that are not part of a stack.
	 * If you prefer to have this, set `skipSinglePR` to `false`
	 */
	stackTreeComment: {
		enable: boolean;
		skipSinglePR: boolean;
	};
}

const defaultOptions = {
	enabled: true,
	restrictCommandsToOriginator: true,
	singleComment: false,
	skipReadyCheck: false,
	stackTreeComment: {
		enable: true,
		skipSinglePR: true,
	},
} satisfies SquashBotConfig;

export async function getConfig(context: Context): Promise<SquashBotConfig> {
	const config = await context.config<SquashBotConfig>(
		"pr-stacker.yml",
		defaultOptions,
	);

	return config ?? defaultOptions;
}

export async function getMainBranch(context: Context) {
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
