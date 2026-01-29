/**
 * Custom error classes for clone operations.
 */

/**
 * Base error class for ccs-cloner operations.
 */
export class CcsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CcsError";
	}
}

/**
 * Error thrown when a session cannot be found.
 */
export class SessionNotFoundError extends CcsError {
	public readonly sessionId: string;

	constructor(sessionId: string) {
		super(`Session not found: ${sessionId}`);
		this.name = "SessionNotFoundError";
		this.sessionId = sessionId;
	}
}

/**
 * Error thrown when session file is invalid or corrupted.
 */
export class InvalidSessionError extends CcsError {
	public readonly filePath: string;
	public readonly reason: string;

	constructor(filePath: string, reason: string) {
		super(`Invalid session file: ${filePath} - ${reason}`);
		this.name = "InvalidSessionError";
		this.filePath = filePath;
		this.reason = reason;
	}
}

/**
 * Error thrown when configuration is invalid.
 */
export class ConfigurationError extends CcsError {
	public readonly field: string;

	constructor(field: string, message: string) {
		super(`Configuration error for '${field}': ${message}`);
		this.name = "ConfigurationError";
		this.field = field;
	}
}

/**
 * Error thrown when CLI arguments are invalid.
 */
export class ArgumentValidationError extends CcsError {
	public readonly argument: string;

	constructor(argument: string, message: string) {
		super(`Invalid argument '${argument}': ${message}`);
		this.name = "ArgumentValidationError";
		this.argument = argument;
	}
}

/**
 * Error thrown when active branch extraction fails.
 */
export class ActiveBranchExtractionError extends CcsError {
	public readonly reason: string;

	constructor(reason: string) {
		super(`Active branch extraction failed: ${reason}`);
		this.name = "ActiveBranchExtractionError";
		this.reason = reason;
	}
}

/**
 * Error thrown when file operations fail.
 */
export class FileOperationError extends CcsError {
	public readonly filePath: string;
	public readonly operation: "read" | "write" | "delete";

	constructor(
		filePath: string,
		operation: "read" | "write" | "delete",
		message: string,
	) {
		super(`Failed to ${operation} file '${filePath}': ${message}`);
		this.name = "FileOperationError";
		this.filePath = filePath;
		this.operation = operation;
	}
}
