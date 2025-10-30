/**
 * Base class for expected errors that should not be reported to Sentry.
 * These are validation failures and user errors that are part of normal operation.
 */
export class ExpectedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExpectedError";
	}
}

/**
 * Thrown when a validation check fails (e.g., PR not ready to merge, CI checks failing).
 * These errors are expected and should be shown to users but not reported to Sentry.
 */
export class ValidationError extends ExpectedError {
	constructor(message: string) {
		super(message);
		this.name = "ValidationError";
	}
}

/**
 * Thrown when a user lacks permission to perform an action.
 * These errors are expected and should not be reported to Sentry.
 */
export class PermissionError extends ExpectedError {
	constructor(message: string) {
		super(message);
		this.name = "PermissionError";
	}
}

/**
 * Thrown when there's an issue with the configuration file.
 * These errors are expected and should not be reported to Sentry.
 */
export class ConfigurationError extends ExpectedError {
	constructor(message: string) {
		super(message);
		this.name = "ConfigurationError";
	}
}
