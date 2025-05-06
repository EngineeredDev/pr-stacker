import { DirectedGraph } from "graphology";
import type { Context } from "probot";
import { getMainBranch } from "./config.js";
import type { PullRequest } from "./pull-request.js";
import type { SubCommand } from "./utils.js";

export type StackNode =
	| {
			type: "perennial";
			ref: string;
	  }
	| ({
			type: "pull-request";
	  } & PullRequest);

/**
 * Builds a graph of all open PRs and their relationships
 * @param context Probot context
 * @returns Array of PullRequest objects representing the stack
 */
export async function getPRStack(
	prNumber: number,
	context: Context,
): Promise<PullRequest[]> {
	const repoGraph = new DirectedGraph<StackNode>();
	const mainBranch = await getMainBranch(context);

	// Get all open PRs
	const { data: openPullRequests } = await context.octokit.pulls.list({
		...context.repo(),
		state: "open",
	});

	// Add main branch to graph
	repoGraph.addNode(mainBranch, {
		type: "perennial",
		ref: mainBranch,
	});

	// Add all open PRs to the graph
	for (const pr of openPullRequests) {
		repoGraph.addNode(pr.number.toString(), {
			type: "pull-request",
			prNumber: pr.number,
			baseRef: pr.base.ref,
			headRef: pr.head.ref,
			title: pr.title,
			body: pr.body,
		});
	}

	// Connect PRs based on base/head relationships
	for (const pr of openPullRequests) {
		// Connect to main branch if base is main
		if (pr.base.ref === mainBranch) {
			repoGraph.addDirectedEdge(mainBranch, pr.number.toString());
		} else {
			// Find PRs where this PR's base is another PR's head
			const basePR = openPullRequests.find(
				(basePr) => basePr.head.ref === pr.base.ref,
			);
			if (basePR) {
				repoGraph.addDirectedEdge(
					basePR.number.toString(),
					pr.number.toString(),
				);
			}
		}
	}

	// Build the stack
	return buildPRStack(repoGraph, prNumber.toString(), mainBranch);
}

/**
 * Builds a stack of PRs starting from a specific PR
 * @param graph The PR relationship graph
 * @param startPrId The ID of the starting PR
 * @param mainBranch The name of the main branch
 * @returns Array of PullRequest objects
 */
function buildPRStack(
	graph: DirectedGraph<StackNode>,
	startPrId: string,
	mainBranch: string,
): PullRequest[] {
	const stack: string[] = [];
	let currentNodeId: string = startPrId;

	// First find the root of the stack
	while (currentNodeId && currentNodeId !== mainBranch) {
		const inNeighbors = graph.inNeighbors(currentNodeId);
		if (inNeighbors.length === 0) break;

		currentNodeId = inNeighbors[0];
		if (currentNodeId !== mainBranch) {
			stack.unshift(currentNodeId);
		}
	}

	// Now build up from the root to find all PRs in this stack
	stack.push(startPrId);
	currentNodeId = startPrId;

	// Now add any PRs that appear above
	while (currentNodeId) {
		const outNeighbors = graph.outNeighbors(currentNodeId);
		if (outNeighbors.length === 0) {
			break;
		}

		currentNodeId = outNeighbors[0];
		stack.push(currentNodeId);
	}

	return stack
		.map((nodeId) => graph.getNodeAttributes(nodeId))
		.filter((node) => node.type === "pull-request")
		.map((node) => ({
			prNumber: node.prNumber,
			baseRef: node.baseRef,
			headRef: node.headRef,
			title: node.title,
			body: node.body,
		}));
}

export function getRelevantPRsFromStack<T = SubCommand>(
	currentPrNumber: number,
	stack: PullRequest[],
	subCommand: T,
) {
	const idx = stack.findIndex((pr) => pr.prNumber === currentPrNumber);

	if (idx === -1) {
		throw new Error("Could not find PR that was commented on.");
	}

	switch (subCommand) {
		case "all":
			return stack;
		case "down":
			return stack.slice(0, idx + 1); // include the current PR
		case "up":
			return stack.slice(idx);
		case "only":
			return [stack[idx]];
	}

	throw new Error(
		`Could not understand the given sub command: \`${subCommand}\``,
	);
}
