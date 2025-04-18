import type { Context } from "probot";

export interface SquashBotConfig {
  enabled: boolean;
  mainBranch?: string;
}

export async function getConfig(context: Context<"issue_comment">) {
  return await context.config<SquashBotConfig>("squashbot.yml", {
    enabled: true,
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
