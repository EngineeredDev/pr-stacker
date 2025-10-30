import type { Context } from "probot";
import { getContextLogger } from "./logger.js";
import { getErrorMessage } from "./utils.js";

/**
 * Base class for expected errors that should not be reported to Sentry.
 * These are validation failures and user errors that are part of normal operation.
 */
export class ExpectedError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ExpectedError";
	}
}

/**
 * Thrown when a validation check fails (e.g., PR not ready to merge, CI checks failing).
 * These errors are expected and should be shown to users but not reported to Sentry.
 */
export class ValidationError extends ExpectedError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ValidationError";
	}
}

/**
 * Thrown when a user lacks permission to perform an action.
 * These errors are expected and should not be reported to Sentry.
 */
export class PermissionError extends ExpectedError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "PermissionError";
	}
}

/**
 * Thrown when there's an issue with the configuration file.
 * These errors are expected and should not be reported to Sentry.
 */
export class ConfigurationError extends ExpectedError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ConfigurationError";
	}
}

/**
 * Centralized error handler that logs errors at the appropriate level and re-throws them.
 *
 * This function automatically:
 * - Logs ExpectedErrors at warn level (not sent to Sentry)
 * - Logs unexpected errors at error level (sent to Sentry)
 * - Preserves stack traces via error cause chain
 * - Re-wraps errors with contextual messages
 *
 * @param context - Probot context for logging
 * @param error - The caught error
 * @param options - Configuration for error handling
 * @param options.userMessage - Message to show in the wrapped error (displayed to users)
 * @param options.logMessage - Message for the log entry
 * @param options.logContext - Additional context data for debugging
 * @throws Always throws a wrapped version of the error with preserved stack trace
 */
export function handleAndLogError(
	context: Context,
	error: unknown,
	options: {
		userMessage: string;
		logMessage: string;
		logContext?: Record<string, unknown>;
	},
): never {
	const log = getContextLogger(context);

	// Log at appropriate level based on error type
	if (error instanceof ExpectedError) {
		// Expected errors (validation failures) logged at warn level - not sent to Sentry
		log.warn({ error, ...options.logContext }, options.logMessage);
	} else {
		// Unexpected errors (bugs, API failures) logged at error level - sent to Sentry
		log.error({ error, ...options.logContext }, options.logMessage);
	}

	// Re-wrap error while preserving stack trace via cause chain
	if (error instanceof ExpectedError) {
		// Preserve the specific ExpectedError subclass (ValidationError, etc.)
		const WrappedErrorClass = error.constructor as new (
			message: string,
			options?: ErrorOptions,
		) => ExpectedError;
		throw new WrappedErrorClass(options.userMessage, { cause: error });
	}

	// Wrap unexpected errors as regular Error
	throw new Error(options.userMessage, { cause: error });
}
