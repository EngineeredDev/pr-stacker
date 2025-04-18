import type { Context } from "probot";
import { getPRStack, getRelevantPRsFromStack } from "./pr-graph.js";
import { getErrorMessage, type SubCommand } from "./utils.js";

export async function handleSquashCommand(
  context: Context<"issue_comment.created">,
  subCommand: SubCommand = "only",
) {
  const currentPrNumber = context.payload.issue.number;

  const stack = await getPRStack(context);

  const reducedStack = getRelevantPRsFromStack(
    currentPrNumber,
    stack,
    subCommand,
  );

  return await Promise.all(
    reducedStack.map((pr) => squashPR(context, pr.prNumber)),
  );
}

export async function squashPR(
  context: Context<"issue_comment.created">,
  prNumber: number,
) {
  const { octokit, payload } = context;

  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;

  try {
    // Step 1: Get PR information
    const { data: pullRequest } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const prTitle = pullRequest.title;
    const prBody = pullRequest.body || "";
    const headRef = pullRequest.head.ref;
    const baseRef = pullRequest.base.ref;

    // Step 2: Get all commits in the PR
    const { data: commits } = await octokit.pulls.listCommits({
      owner,
      repo,
      pull_number: prNumber,
    });

    if (commits.length === 0) {
      throw new Error("There are no commits in this PR");
    }

    const originalCommit = commits[0];
    const authorName =
      originalCommit.commit.author?.name || pullRequest.user.login;
    const authorEmail =
      originalCommit.commit.author?.email ||
      `${pullRequest.user.login}@users.noreply.github.com`;
    const authorDate =
      originalCommit.commit.author?.date || new Date().toISOString();

    // Step 3: Get the base branch's commit to identify PR-specific commits
    const { data: baseBranch } = await octokit.repos.getBranch({
      owner,
      repo,
      branch: baseRef,
    });
    const baseSha = baseBranch.commit.sha;

    // Step 4: Create a temporary branch from the current head
    const tempBranchName = `temp-squash-${headRef}-${Date.now()}`;
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${tempBranchName}`,
      sha: pullRequest.head.sha,
    });

    // Step 5: Get the tree from the last commit
    const { data: lastCommit } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: pullRequest.head.sha,
    });
    const treeSha = lastCommit.tree.sha;

    // Step 6: Create a new squashed commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message: `${prTitle}\n\n${prBody}`,
      tree: treeSha,
      parents: [baseSha],
      author: {
        name: authorName,
        email: authorEmail,
        date: authorDate,
      },
    });

    // Step 7: Update the PR branch to point to the new squashed commit
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${headRef}`,
      sha: newCommit.sha,
      force: true,
    });

    // Step 8: Clean up the temporary branch
    await octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${tempBranchName}`,
    });

    return Promise.resolve({
      message: `✅ Successfully squashed ${commits.length} commits into one commit with the PR title and description.`,
      options: {
        issue_number: prNumber,
      },
    });
  } catch (error) {
    throw new Error(
      `Could not squash PR #${prNumber}: ${getErrorMessage(error)}`,
    );
  }
}
