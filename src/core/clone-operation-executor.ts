/**
 * Clone Operation Executor
 *
 * Orchestrates the complete clone pipeline:
 * 1. Find and read source session
 * 2. Extract active branch (discard orphans)
 * 3. Filter cloneable entries
 * 4. Apply tool/thinking removal
 * 5. Repair parent chain
 * 6. Generate new session ID
 * 7. Write output file, todos, and session-env
 * 8. Update session index
 */

import { randomUUID } from "crypto";
import { basename, isAbsolute, join } from "pathe";
import { getDefaultClaudeDir } from "../config/default-configuration.js";
import { resolveToolRemovalOptions } from "../config/tool-removal-presets.js";
import {
	findSessionFileById,
	getProjectDirFromPath,
	isPathInsideClaudeDir,
} from "../io/session-directory-scanner.js";
import {
	extractFirstUserMessage,
	parseSessionFile,
	serializeSessionEntries,
} from "../io/session-file-reader.js";
import {
	createSessionEnvDirectory,
	createTodosFile,
	writeSessionFile,
} from "../io/session-file-writer.js";
import { addSessionToIndex } from "../io/session-index-updater.js";
import type {
	CloneOperationOptions,
	CloneOperationResult,
	CloneOperationStatistics,
	ResolvedToolRemovalOptions,
	SessionLineItem,
} from "../types/index.js";
import { repairBrokenParentReferences } from "./parent-chain-repairer.js";
// DISABLED: Active branch extraction causes issues with cross-file parent references
// import { extractActiveBranchFromSession, findSummaryLeafUuid } from "./active-branch-extractor.js";
import { filterCloneableEntries } from "./session-line-item-filter.js";
import { removeToolCallsFromHistory } from "./tool-call-remover.js";
import { countTurns } from "./turn-boundary-calculator.js";

/**
 * Execute a complete clone operation.
 *
 * @param options - Clone operation options
 * @returns Clone operation result with statistics
 */
export async function executeCloneOperation(
	options: CloneOperationOptions,
): Promise<CloneOperationResult> {
	const claudeDir = options.claudeDataDirectory || getDefaultClaudeDir();

	// 1. Find and read source session
	const sourcePath = await findSessionFileById(
		options.sourceSessionId,
		claudeDir,
	);
	const { entries: allEntries, rawContent } =
		await parseSessionFile(sourcePath);
	const originalSize = Buffer.byteLength(rawContent, "utf-8");
	const originalTurnCount = countTurns(allEntries);

	// 2. Extract active branch (DISABLED - causes issues with cross-file parent references)
	// const summaryLeafUuid = findSummaryLeafUuid(allEntries);
	// const activeBranch = extractActiveBranchFromSession(allEntries, summaryLeafUuid);
	// let entries = activeBranch.entriesInActiveChain;
	// const orphanedCount = activeBranch.extractionStatistics.orphanedEntriesDiscarded;
	let entries = allEntries;
	const orphanedCount = 0;

	// 3. Filter cloneable entries
	const filterResult = filterCloneableEntries(entries);
	entries = filterResult.entries;
	const filteredCount = filterResult.filteredCount;

	// 4. Apply tool/thinking removal if configured
	let toolCallsRemoved = 0;
	let toolCallsTruncated = 0;
	let thinkingBlocksRemoved = 0;

	if (options.toolRemovalConfig) {
		// Resolve options using preset system, including custom presets
		const removalOptions: ResolvedToolRemovalOptions =
			resolveToolRemovalOptions(
				options.toolRemovalConfig,
				options.customPresets,
			);

		const removalResult = removeToolCallsFromHistory(entries, removalOptions);
		entries = removalResult.processedEntries;
		toolCallsRemoved = removalResult.statistics.toolCallsRemoved;
		toolCallsTruncated = removalResult.statistics.toolCallsTruncated;
		thinkingBlocksRemoved = removalResult.statistics.thinkingBlocksRemoved;
	}

	// 5. Repair parent chain
	entries = repairBrokenParentReferences(entries);

	// 6. Generate new session ID and update entries
	const newSessionId = randomUUID();
	entries = updateSessionIds(entries, newSessionId);

	// 7. Create summary entry
	const firstUserMessage = extractFirstUserMessage(entries);
	const summaryEntry = createSummaryEntry(entries, firstUserMessage);

	// Prepend summary to entries
	const finalEntries = [summaryEntry, ...entries];

	// 8. Determine output path and write
	const projectDir = getProjectDirFromPath(sourcePath);
	const outputPath = options.outputPathOverride
		? isAbsolute(options.outputPathOverride)
			? options.outputPathOverride
			: join(projectDir, options.outputPathOverride)
		: join(projectDir, `${newSessionId}.jsonl`);

	const outputContent = serializeSessionEntries(finalEntries);
	await writeSessionFile(outputPath, outputContent);
	const outputSize = Buffer.byteLength(outputContent, "utf-8");

	// 9. Create todos file, session-env directory, and update index (only if output is inside Claude dir)
	const isInternalOutput = isPathInsideClaudeDir(outputPath, claudeDir);

	if (isInternalOutput) {
		await createTodosFile(newSessionId, claudeDir);
		await createSessionEnvDirectory(newSessionId, claudeDir);

		// Use the actual output project directory for index updates, not the source project
		const outputProjectDir = getProjectDirFromPath(outputPath);
		await addSessionToIndex(outputProjectDir, newSessionId, outputPath, {
			firstPrompt: firstUserMessage,
			messageCount: finalEntries.length,
			projectPath: decodeProjectPath(basename(outputProjectDir)),
		});
	}

	// 10. Calculate statistics
	const outputTurnCount = countTurns(entries);
	const fileSizeReductionPercent =
		originalSize > 0 ? ((originalSize - outputSize) / originalSize) * 100 : 0;

	const statistics: CloneOperationStatistics = {
		turnCountOriginal: originalTurnCount,
		turnCountOutput: outputTurnCount,
		toolCallsRemoved,
		toolCallsTruncated,
		thinkingBlocksRemoved,
		orphanedEntriesDiscarded: orphanedCount,
		entriesFiltered: filteredCount,
		fileSizeReductionPercent,
		originalSizeBytes: originalSize,
		outputSizeBytes: outputSize,
	};

	return {
		operationSucceeded: true,
		clonedSessionId: newSessionId,
		clonedSessionFilePath: outputPath,
		sourceSessionId: options.sourceSessionId,
		sourceSessionFilePath: sourcePath,
		operationStatistics: statistics,
	};
}

/**
 * Update session IDs on all entries.
 */
function updateSessionIds(
	entries: SessionLineItem[],
	newSessionId: string,
): SessionLineItem[] {
	return entries.map((entry) => ({
		...entry,
		// Only update sessionId if entry originally had one
		...(entry.sessionId !== null && entry.sessionId !== undefined
			? { sessionId: newSessionId }
			: {}),
	}));
}

/**
 * Create a summary entry for the cloned session.
 */
function createSummaryEntry(
	entries: SessionLineItem[],
	firstUserMessage: string,
): SessionLineItem {
	// Find the LAST entry with a uuid to use as leafUuid
	const lastWithUuid = [...entries].reverse().find((e) => e.uuid);
	const leafUuid = lastWithUuid?.uuid || randomUUID();

	return {
		type: "summary",
		summary: generateCloneTitle(firstUserMessage),
		leafUuid,
	};
}

/**
 * Generate a descriptive title for cloned sessions.
 */
function generateCloneTitle(
	firstUserMessage: string,
	maxLength: number = 50,
): string {
	const trimmed = firstUserMessage.trim();
	const preview =
		trimmed.length === 0
			? "(No message)"
			: trimmed.length <= maxLength
				? trimmed
				: trimmed.slice(0, maxLength) + "...";

	const timestamp = formatTimestamp(new Date());
	return `Clone: ${preview} (${timestamp})`;
}

/**
 * Format a timestamp for display.
 */
function formatTimestamp(date: Date): string {
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	const month = months[date.getMonth()];
	const day = date.getDate();
	let hours = date.getHours();
	const minutes = date.getMinutes().toString().padStart(2, "0");
	const ampm = hours >= 12 ? "pm" : "am";
	hours = hours % 12 || 12;
	return `${month} ${day} ${hours}:${minutes}${ampm}`;
}

/**
 * Decode project path from folder name.
 */
function decodeProjectPath(encoded: string): string {
	if (encoded.startsWith("-")) {
		return encoded.replace(/-/g, "/");
	}
	return encoded;
}
