/**
 * Session File Writer
 *
 * Handles writing JSONL session files and creating todos file and session-env directory.
 */

import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "pathe";
import { FileOperationError } from "../errors/clone-operation-errors.js";
import { logWarning } from "../output/configured-logger.js";

/**
 * Write a session file to disk.
 *
 * Creates parent directories if they don't exist.
 *
 * @param filePath - Path to write the file
 * @param content - JSONL content to write
 */
export async function writeSessionFile(
	filePath: string,
	content: string,
): Promise<void> {
	try {
		// Ensure directory exists
		await mkdir(dirname(filePath), { recursive: true });
		await writeFile(filePath, content, "utf-8");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new FileOperationError(filePath, "write", message);
	}
}

/**
 * Create an empty todos file for a new session.
 *
 * Creates: ~/.claude/todos/<sessionId>-agent-<sessionId>.json
 *
 * @param sessionId - New session ID
 * @param claudeDir - Claude data directory
 */
export async function createTodosFile(
	sessionId: string,
	claudeDir: string,
): Promise<void> {
	const todosDir = join(claudeDir, "todos");

	try {
		await mkdir(todosDir, { recursive: true });
		const todosPath = join(todosDir, `${sessionId}-agent-${sessionId}.json`);
		await writeFile(todosPath, "[]", "utf-8");
	} catch (err) {
		// Non-fatal: log warning but don't fail the operation
		logWarning(`Could not create todos file: ${err}`);
	}
}

/**
 * Create an empty session-env directory for a new session.
 *
 * Creates: ~/.claude/session-env/<sessionId>/
 *
 * @param sessionId - New session ID
 * @param claudeDir - Claude data directory
 */
export async function createSessionEnvDirectory(
	sessionId: string,
	claudeDir: string,
): Promise<void> {
	const sessionEnvPath = join(claudeDir, "session-env", sessionId);

	try {
		await mkdir(sessionEnvPath, { recursive: true });
	} catch (err) {
		// Non-fatal: log warning but don't fail the operation
		logWarning(`Could not create session-env directory: ${err}`);
	}
}

/**
 * Write content atomically using a temp file and rename.
 *
 * @param filePath - Target file path
 * @param content - Content to write
 */
export async function writeFileAtomic(
	filePath: string,
	content: string,
): Promise<void> {
	const tempPath = filePath + ".tmp";

	try {
		await mkdir(dirname(filePath), { recursive: true });
		await writeFile(tempPath, content, "utf-8");

		// Use Bun's rename for atomic operation
		const fs = await import("fs/promises");
		await fs.rename(tempPath, filePath);
	} catch (err) {
		// Clean up temp file if it exists
		try {
			const fs = await import("fs/promises");
			await fs.unlink(tempPath);
		} catch {
			// Ignore cleanup errors
		}

		const message = err instanceof Error ? err.message : String(err);
		throw new FileOperationError(filePath, "write", message);
	}
}
