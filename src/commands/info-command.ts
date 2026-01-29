/**
 * Info Command
 *
 * Show detailed information about a Claude Code session.
 */

import { defineCommand } from "citty";
import { stat } from "fs/promises";
import { basename, dirname } from "pathe";
import { loadConfiguration } from "../config/configuration-loader.js";
import { countTurns } from "../core/turn-boundary-calculator.js";
import {
	decodeProjectPath,
	findSessionFileById,
} from "../io/session-directory-scanner.js";
import {
	countToolCalls,
	extractFirstUserMessage,
	hasThinkingBlocks,
	parseSessionFile,
} from "../io/session-file-reader.js";
import {
	formatError,
	formatSessionDetails,
} from "../output/clone-result-formatter.js";
import type { SessionDetails } from "../types/index.js";

export const infoCommand = defineCommand({
	meta: {
		name: "info",
		description: "Show session details",
	},

	args: {
		sessionId: {
			type: "positional",
			description: "Session ID (UUID) to inspect",
			required: true,
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

			// Get session details
			const details = await getSessionDetails(
				args.sessionId,
				config.claudeDataDirectory,
			);

			// Output result
			const output = formatSessionDetails(details, {
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
 * Get detailed session information.
 */
async function getSessionDetails(
	sessionId: string,
	claudeDir: string,
): Promise<SessionDetails> {
	// Find the session file
	const sessionPath = await findSessionFileById(sessionId, claudeDir);

	// Read and parse the session
	const { entries } = await parseSessionFile(sessionPath);
	const fileStat = await stat(sessionPath);

	// Calculate statistics
	const turnCount = countTurns(entries);
	const firstMessage = extractFirstUserMessage(entries);
	const toolCallCount = countToolCalls(entries);
	const hasThinking = hasThinkingBlocks(entries);

	// Get project path from parent directory
	const projectDir = dirname(sessionPath);
	const projectFolder = basename(projectDir);
	const projectPath = decodeProjectPath(projectFolder);

	return {
		sessionId,
		projectPath,
		firstMessage: firstMessage.slice(0, 200),
		turnCount,
		createdAt: fileStat.birthtime,
		modifiedAt: fileStat.mtime,
		sizeBytes: fileStat.size,
		entryCount: entries.length,
		hasThinking,
		toolCallCount,
		filePath: sessionPath,
	};
}
