import type { Context } from "probot";
import { RequestError } from "@octokit/request-error";

export interface PullRequest {
  prNumber: number;
  baseRef: string;
  headRef: string;
  title: string;
  body?: string | null;
}

interface CheckMergeReadinessOptions {
  validateCommits: boolean;
}

export async function checkMergeReadiness(
  pr: PullRequest,
  context: Context<"issue_comment.created">,
  options: CheckMergeReadinessOptions = { validateCommits: false },
) {
  const { octokit } = context;
  const { validateCommits } = options;

  const repo = context.payload.repository.name;
  const owner = context.payload.repository.owner.login;

  // Get fresh PR data to trigger mergeability check
  const { data: freshPR } = await octokit.pulls.get({
    owner,
    repo,
    pull_number: pr.prNumber,
  });

  // If `validateCommits`, check that only one commit exists
  // TODO: should also validate the commit title/body. Configurable?
  if (validateCommits && freshPR.commits !== 1) {
    return false;
  }

  // Check mergeability flags
  if (freshPR.mergeable_state !== "clean") {
    return false;
  }

  try {
    // Verify required status checks
    const { data: statusChecks } =
      await context.octokit.repos.getStatusChecksProtection({
        owner,
        repo,
        branch: freshPR.head.ref,
      });

    // Check individual check runs
    const { data: checks } = await octokit.checks.listForRef({
      owner,
      repo,
      ref: freshPR.head.sha,
    });

    return statusChecks.contexts.every((context) =>
      checks.check_runs.some(
        (run) => run.name === context && run.conclusion === "success",
      ),
    );
  } catch (error) {
    // TODO: Ew. Can't find a better way.
    // If a branch has no protection rules setup, Github just returns a 404 with a specific body message.
    if (
      error instanceof RequestError &&
      error.status === 404 &&
      typeof error.response?.data === "object" &&
      error.response?.data !== null &&
      "message" in error.response.data &&
      typeof error.response.data.message === "string" &&
      error.response.data.message.includes("Branch not protected")
    ) {
      // No branch protection rules. Swallow the error and consider it ready for merge
      return true;
    }

    throw error;
  }
}
