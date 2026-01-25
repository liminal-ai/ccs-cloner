/**
 * Session Directory Scanner
 *
 * Finds session files in the Claude Code data directory.
 */

import { readdir, stat } from "fs/promises";
import { join, dirname, isAbsolute, resolve } from "pathe";
import { SessionNotFoundError } from "../errors/clone-operation-errors.js";
import { getDefaultClaudeDir } from "../config/default-configuration.js";

/**
 * Find a session file by its session ID.
 *
 * Searches all project directories for a matching session file.
 *
 * @param sessionId - Session ID (UUID) to find
 * @param claudeDir - Claude data directory (default: ~/.claude)
 * @returns Absolute path to the session JSONL file
 * @throws SessionNotFoundError if session is not found
 */
export async function findSessionFileById(sessionId: string, claudeDir?: string): Promise<string> {
  const baseDir = claudeDir || getDefaultClaudeDir();
  const projectsDir = join(baseDir, "projects");

  try {
    // Read all project directories
    const projectDirs = await readdir(projectsDir, { withFileTypes: true });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) {
        continue;
      }

      const projectPath = join(projectsDir, dir.name);

      // Check for regular session file
      const sessionFile = join(projectPath, `${sessionId}.jsonl`);
      try {
        await stat(sessionFile);
        return sessionFile;
      } catch {
        // File doesn't exist in this project, continue searching
      }

      // Also check for agent session files (agent-<sessionId>.jsonl)
      const agentSessionFile = join(projectPath, `agent-${sessionId}.jsonl`);
      try {
        await stat(agentSessionFile);
        return agentSessionFile;
      } catch {
        // Not found here either, continue searching
      }
    }

    throw new SessionNotFoundError(sessionId);
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      throw err;
    }
    // If projectsDir doesn't exist or other error, treat as not found
    throw new SessionNotFoundError(sessionId);
  }
}

/**
 * Get the project directory from a session file path.
 *
 * Session files are at ~/.claude/projects/<encoded-path>/<sessionId>.jsonl
 * So the project dir is the parent directory.
 *
 * @param sessionPath - Full path to session file
 * @returns Path to the project directory containing the session
 */
export function getProjectDirFromPath(sessionPath: string): string {
  return dirname(sessionPath);
}

/**
 * Check if a path is inside the Claude data directory.
 *
 * @param targetPath - Path to check
 * @param claudeDir - Claude data directory
 * @returns true if targetPath is inside claudeDir
 */
export function isPathInsideClaudeDir(targetPath: string, claudeDir: string): boolean {
  const normalizedTarget = isAbsolute(targetPath) ? targetPath : resolve(targetPath);
  const normalizedClaudeDir = isAbsolute(claudeDir) ? claudeDir : resolve(claudeDir);

  // Add trailing separator to avoid false positives like /Users/foo/.claude-backup matching /Users/foo/.claude
  const claudeDirWithSep = normalizedClaudeDir.endsWith("/")
    ? normalizedClaudeDir
    : normalizedClaudeDir + "/";

  return normalizedTarget === normalizedClaudeDir || normalizedTarget.startsWith(claudeDirWithSep);
}

/**
 * List all project directories.
 *
 * @param claudeDir - Claude data directory (default: ~/.claude)
 * @returns Array of project directory info
 */
export async function listAllProjects(
  claudeDir?: string
): Promise<Array<{ folder: string; path: string; fullPath: string }>> {
  const baseDir = claudeDir || getDefaultClaudeDir();
  const projectsDir = join(baseDir, "projects");

  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    const projects: Array<{ folder: string; path: string; fullPath: string }> = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        projects.push({
          folder: entry.name,
          path: decodeProjectPath(entry.name),
          fullPath: join(projectsDir, entry.name),
        });
      }
    }

    return projects;
  } catch {
    return [];
  }
}

/**
 * List all session files in a project directory.
 *
 * @param projectDir - Full path to project directory
 * @returns Array of session file paths
 */
export async function listSessionsInProject(projectDir: string): Promise<string[]> {
  try {
    const entries = await readdir(projectDir);
    return entries.filter((name) => name.endsWith(".jsonl")).map((name) => join(projectDir, name));
  } catch {
    return [];
  }
}

/**
 * Decode an encoded project path back to the original path.
 *
 * Encoding: forward slashes become dashes (e.g., /Users/foo -> -Users-foo)
 *
 * LIMITATION: This decoding is lossy. If the original path contained dashes,
 * they are indistinguishable from encoded slashes. For example:
 * - "/Users/foo-bar" encodes to "-Users-foo-bar"
 * - Decoding gives "/Users/foo/bar" (incorrect)
 * This matches Claude Code's behavior and cannot be fixed without changing the encoding scheme.
 *
 * @param encoded - Encoded folder name
 * @returns Decoded path (may be inaccurate for paths containing dashes)
 */
export function decodeProjectPath(encoded: string): string {
  if (encoded.startsWith("-")) {
    return encoded.replace(/-/g, "/");
  }
  return encoded;
}

/**
 * Encode a project path for storage as a folder name.
 *
 * @param path - Original path
 * @returns Encoded folder name
 */
export function encodeProjectPath(path: string): string {
  return path.replace(/\//g, "-");
}
