/**
 * Session Index Updater
 *
 * Updates sessions-index.json with new session entries.
 */

import { readFile, writeFile, stat, rename } from "fs/promises";
import { join } from "pathe";
import type { SessionsIndex, SessionIndexEntry } from "../types/index.js";
import { FileOperationError } from "../errors/clone-operation-errors.js";

/**
 * Metadata for adding a session to the index.
 */
export interface SessionIndexMetadata {
  /** First user prompt text */
  firstPrompt: string;
  /** Total number of messages in session */
  messageCount: number;
  /** Decoded project path */
  projectPath: string;
}

/**
 * Add a new session to the sessions-index.json file.
 *
 * Creates a backup of the existing index before modifying.
 * Uses atomic write (temp file + rename) to prevent corruption.
 *
 * @param projectDir - Project directory containing sessions-index.json
 * @param sessionId - New session ID
 * @param sessionFilePath - Full path to new session file
 * @param metadata - Session metadata
 */
export async function addSessionToIndex(
  projectDir: string,
  sessionId: string,
  sessionFilePath: string,
  metadata: SessionIndexMetadata
): Promise<void> {
  const indexPath = join(projectDir, "sessions-index.json");
  const backupPath = indexPath + ".bak";
  const tempPath = indexPath + ".tmp";

  let index: SessionsIndex = { version: 1, entries: [] };

  // Try to read existing index
  try {
    const content = await readFile(indexPath, "utf-8");
    index = JSON.parse(content) as SessionsIndex;
    // Backup existing index before modifying
    await writeFile(backupPath, content, "utf-8");
  } catch {
    // Index doesn't exist yet, no backup needed
  }

  // Get file stats for the new session
  let fileMtime = Date.now();
  try {
    const fileStat = await stat(sessionFilePath);
    fileMtime = fileStat.mtimeMs;
  } catch {
    // Use current time if stat fails
  }

  // Create new entry
  const newEntry: SessionIndexEntry = {
    sessionId,
    fullPath: sessionFilePath,
    fileMtime,
    firstPrompt: metadata.firstPrompt.slice(0, 100),
    summary: `Clone: ${metadata.firstPrompt.slice(0, 50)}...`,
    messageCount: metadata.messageCount,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    projectPath: metadata.projectPath,
    isSidechain: false,
  };

  // Add to index
  index.entries.push(newEntry);

  // Validate JSON before write
  const newContent = JSON.stringify(index, null, 2);
  try {
    JSON.parse(newContent); // Validate JSON is valid
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FileOperationError(indexPath, "write", `Generated invalid JSON: ${message}`);
  }

  // Atomic write: write to temp, then rename
  try {
    await writeFile(tempPath, newContent, "utf-8");
    await rename(tempPath, indexPath);
  } catch (err) {
    // Clean up temp file if it exists
    try {
      const fs = await import("fs/promises");
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }

    const message = err instanceof Error ? err.message : String(err);
    throw new FileOperationError(indexPath, "write", message);
  }
}

/**
 * Read the sessions index file.
 *
 * @param projectDir - Project directory containing sessions-index.json
 * @returns Sessions index or null if not found
 */
export async function readSessionsIndex(projectDir: string): Promise<SessionsIndex | null> {
  const indexPath = join(projectDir, "sessions-index.json");

  try {
    const content = await readFile(indexPath, "utf-8");
    return JSON.parse(content) as SessionsIndex;
  } catch {
    return null;
  }
}

/**
 * Remove a session from the index.
 *
 * @param projectDir - Project directory containing sessions-index.json
 * @param sessionId - Session ID to remove
 * @returns true if session was found and removed
 */
export async function removeSessionFromIndex(
  projectDir: string,
  sessionId: string
): Promise<boolean> {
  const indexPath = join(projectDir, "sessions-index.json");
  const tempPath = indexPath + ".tmp";

  try {
    const content = await readFile(indexPath, "utf-8");
    const index = JSON.parse(content) as SessionsIndex;

    const originalLength = index.entries.length;
    index.entries = index.entries.filter((e) => e.sessionId !== sessionId);

    if (index.entries.length === originalLength) {
      return false; // Session not found
    }

    // Atomic write
    const newContent = JSON.stringify(index, null, 2);
    await writeFile(tempPath, newContent, "utf-8");
    await rename(tempPath, indexPath);

    return true;
  } catch {
    return false;
  }
}
