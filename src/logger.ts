import type { Context } from "probot";

export function getContextLogger(context: Context) {
	const bindings: Record<string, unknown> = {
		event: context.name,
		eventId: context.id,
	};

	// Add repository info if available
	if ("repository" in context.payload && context.payload.repository) {
		bindings.repo =
			context.payload.repository.full_name ||
			`${context.payload.repository.owner.login}/${context.payload.repository.name}`;
	}

	// Add installation ID if available
	if ("installation" in context.payload && context.payload.installation) {
		bindings.installationId = context.payload.installation.id;
	}

	// Add PR number if available
	if ("pull_request" in context.payload && context.payload.pull_request) {
		bindings.prNumber = context.payload.pull_request.number;
	}

	// Add issue number if available (for issue_comment events)
	if ("issue" in context.payload && context.payload.issue) {
		bindings.issueNumber = context.payload.issue.number;
		// Many issue comments are on PRs
		if ("pull_request" in context.payload.issue) {
			bindings.isPR = true;
		}
	}

	// Add sender info
	if ("sender" in context.payload && context.payload.sender) {
		bindings.sender = context.payload.sender.login;
	}

	return context.log.child(bindings);
}

export function getPRLogger(
	context: Context,
	prNumber: number,
	additionalInfo?: Record<string, unknown>,
) {
	const log = getContextLogger(context);

	return log.child({
		prNumber,
		...additionalInfo,
	});
}
