/**
 * List Command
 *
 * List Claude Code sessions with optional filtering.
 */

import { defineCommand } from "citty";
import { stat } from "fs/promises";
import { basename } from "pathe";
import { loadConfiguration } from "../config/configuration-loader.js";
import { countTurns } from "../core/turn-boundary-calculator.js";
import {
	listAllProjects,
	listSessionsInProject,
} from "../io/session-directory-scanner.js";
import {
	extractFirstUserMessage,
	parseSessionFile,
} from "../io/session-file-reader.js";
import {
	formatError,
	formatSessionList,
} from "../output/clone-result-formatter.js";
import type { SessionInfo } from "../types/index.js";

export const listCommand = defineCommand({
	meta: {
		name: "list",
		description: "List sessions",
	},

	args: {
		project: {
			type: "string",
			alias: "p",
			description: "Filter by project path (substring match)",
		},
		limit: {
			type: "string",
			alias: "n",
			description: "Maximum sessions to show",
			default: "20",
		},
		"claude-dir": {
			type: "string",
			description: "Claude data directory (default: ~/.claude)",
		},
		json: {
			type: "boolean",
			description: "Output as JSON",
			default: false,
		},
		verbose: {
			type: "boolean",
			alias: "v",
			description: "Verbose output",
			default: false,
		},
	},

	async run({ args }) {
		try {
			// Load configuration
			const config = await loadConfiguration({
				claudeDataDirectory: args["claude-dir"],
				outputFormat: args.json ? "json" : "human",
				verboseOutput: args.verbose,
			});

			const limitNum = parseInt(args.limit, 10) || 20;

			// List sessions
			const sessions = await listSessions({
				project: args.project,
				limit: limitNum,
				claudeDataDirectory: config.claudeDataDirectory,
			});

			// Output result
			const output = formatSessionList(sessions, {
				json: args.json,
				verbose: args.verbose,
			});
			console.log(output);

			process.exit(0);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			const output = formatError(error, {
				json: args.json,
				debug: args.verbose,
			});
			console.error(output);
			process.exit(1);
		}
	},
});

/**
 * Options for listing sessions.
 */
interface ListOptions {
	project?: string;
	limit?: number;
	claudeDataDirectory?: string;
}

/**
 * List sessions with filtering.
 */
async function listSessions(options: ListOptions): Promise<SessionInfo[]> {
	const claudeDir = options.claudeDataDirectory;
	const limit = options.limit ?? 20;
	const sessions: SessionInfo[] = [];

	// Get all projects
	const projects = await listAllProjects(claudeDir);

	// Filter by project if specified
	let filteredProjects = projects;
	if (options.project) {
		const searchPath = options.project.toLowerCase();
		filteredProjects = projects.filter(
			(p) =>
				p.path.toLowerCase().includes(searchPath) ||
				p.folder.toLowerCase().includes(searchPath),
		);
	}

	// Collect sessions from each project
	for (const project of filteredProjects) {
		const sessionPaths = await listSessionsInProject(project.fullPath);

		for (const sessionPath of sessionPaths) {
			const info = await getSessionInfo(sessionPath, project.path);
			if (info) {
				sessions.push(info);
			}
		}
	}

	// BUG FIX: Sort BEFORE limit (was sorting after in v0.1)
	sessions.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

	// Apply limit AFTER sort
	return sessions.slice(0, limit);
}

/**
 * Get session info from a session file.
 */
async function getSessionInfo(
	sessionPath: string,
	projectPath: string,
): Promise<SessionInfo | null> {
	try {
		const { entries } = await parseSessionFile(sessionPath);
		const fileStat = await stat(sessionPath);

		if (entries.length === 0) {
			return null;
		}

		const turnCount = countTurns(entries);
		const firstMessage = extractFirstUserMessage(entries);

		// Extract session ID from filename
		const filename = basename(sessionPath);
		const sessionId = filename.replace(/\.jsonl$/, "");

		return {
			sessionId,
			projectPath,
			firstMessage: firstMessage.slice(0, 100),
			turnCount,
			createdAt: fileStat.birthtime,
			modifiedAt: fileStat.mtime,
			sizeBytes: fileStat.size,
		};
	} catch {
		return null;
	}
}
