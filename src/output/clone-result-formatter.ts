/**
 * Clone Result Formatter
 *
 * Formats clone operation results for human-readable or JSON output.
 */

import type {
  CloneOperationResult,
  CloneOperationStatistics,
  SessionInfo,
  SessionDetails,
} from "../types/index.js";

/**
 * Output options for formatting.
 */
export interface OutputFormatOptions {
  /** Output as JSON */
  json?: boolean;
  /** Include verbose details */
  verbose?: boolean;
  /** Include debug information */
  debug?: boolean;
  /** Include --dangerously-skip-permissions in resume command */
  dsp?: boolean;
}

/**
 * Format clone result for display.
 *
 * @param result - Clone operation result
 * @param options - Formatting options
 * @returns Formatted output string
 */
export function formatCloneResult(
  result: CloneOperationResult,
  options: OutputFormatOptions = {}
): string {
  if (options.json) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = ["Session cloned successfully!", ""];

  lines.push(`  Source:  ${result.sourceSessionId}`);
  lines.push(`  New ID:  ${result.clonedSessionId}`);
  lines.push(`  Output:  ${result.clonedSessionFilePath}`);
  lines.push("");

  lines.push("Statistics:");
  lines.push(formatStatistics(result.operationStatistics, options));
  lines.push("");

  // Resume command
  const dspFlag = options.dsp ? " --dangerously-skip-permissions" : "";
  lines.push("Resume:");
  lines.push(`  claude --resume ${result.clonedSessionId}${dspFlag}`);

  return lines.join("\n");
}

/**
 * Format clone statistics.
 */
function formatStatistics(stats: CloneOperationStatistics, options: OutputFormatOptions): string {
  const lines: string[] = [];
  const indent = "  ";

  lines.push(`${indent}Turns: ${stats.turnCountOriginal} -> ${stats.turnCountOutput}`);

  if (stats.orphanedEntriesDiscarded > 0 || options.verbose) {
    lines.push(`${indent}Orphaned entries discarded: ${stats.orphanedEntriesDiscarded}`);
  }

  if (stats.toolCallsRemoved > 0 || options.verbose) {
    lines.push(`${indent}Tool calls removed: ${stats.toolCallsRemoved}`);
  }

  if (stats.toolCallsTruncated > 0 || options.verbose) {
    lines.push(`${indent}Tool calls truncated: ${stats.toolCallsTruncated}`);
  }

  if (stats.thinkingBlocksRemoved > 0 || options.verbose) {
    lines.push(`${indent}Thinking blocks removed: ${stats.thinkingBlocksRemoved}`);
  }

  if (stats.entriesFiltered > 0 || options.verbose) {
    lines.push(`${indent}Entries filtered: ${stats.entriesFiltered}`);
  }

  const reduction = stats.fileSizeReductionPercent.toFixed(1);
  lines.push(
    `${indent}Size: ${formatBytes(stats.originalSizeBytes)} -> ${formatBytes(stats.outputSizeBytes)} (-${reduction}%)`
  );

  return lines.join("\n");
}

/**
 * Format session list for display.
 *
 * @param sessions - Array of session info
 * @param options - Formatting options
 * @returns Formatted output string
 */
export function formatSessionList(
  sessions: SessionInfo[],
  options: OutputFormatOptions = {}
): string {
  if (options.json) {
    return JSON.stringify(sessions, null, 2);
  }

  if (sessions.length === 0) {
    return "No sessions found.";
  }

  const lines: string[] = [`Found ${sessions.length} session(s):`, ""];

  for (const session of sessions) {
    lines.push(formatSessionSummary(session));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format a single session summary.
 */
function formatSessionSummary(session: SessionInfo): string {
  const lines: string[] = [];
  const truncatedMessage =
    session.firstMessage.length > 60
      ? session.firstMessage.slice(0, 60) + "..."
      : session.firstMessage;

  lines.push(`  ${session.sessionId}`);
  lines.push(`    Project: ${session.projectPath}`);
  lines.push(`    Message: "${truncatedMessage}"`);
  lines.push(`    Turns: ${session.turnCount} | Size: ${formatBytes(session.sizeBytes)}`);
  lines.push(`    Modified: ${formatDate(session.modifiedAt)}`);

  return lines.join("\n");
}

/**
 * Format session details for display.
 *
 * @param details - Session details
 * @param options - Formatting options
 * @returns Formatted output string
 */
export function formatSessionDetails(
  details: SessionDetails,
  options: OutputFormatOptions = {}
): string {
  if (options.json) {
    return JSON.stringify(details, null, 2);
  }

  const lines: string[] = [`Session: ${details.sessionId}`, ""];

  lines.push("Details:");
  lines.push(`  Project: ${details.projectPath}`);
  lines.push(`  File: ${details.filePath}`);
  lines.push(`  Size: ${formatBytes(details.sizeBytes)}`);
  lines.push("");

  lines.push("Content:");
  lines.push(`  Turns: ${details.turnCount}`);
  lines.push(`  Entries: ${details.entryCount}`);
  lines.push(`  Tool calls: ${details.toolCallCount}`);
  lines.push(`  Has thinking: ${details.hasThinking ? "Yes" : "No"}`);
  lines.push("");

  lines.push("Timestamps:");
  lines.push(`  Created: ${formatDate(details.createdAt)}`);
  lines.push(`  Modified: ${formatDate(details.modifiedAt)}`);
  lines.push("");

  const truncatedMessage =
    details.firstMessage.length > 100
      ? details.firstMessage.slice(0, 100) + "..."
      : details.firstMessage;
  lines.push("First message:");
  lines.push(`  "${truncatedMessage}"`);

  return lines.join("\n");
}

/**
 * Format an error for display.
 *
 * @param error - Error to format
 * @param options - Formatting options
 * @returns Formatted error string
 */
export function formatError(error: Error, options: OutputFormatOptions = {}): string {
  if (options.json) {
    return JSON.stringify(
      {
        error: true,
        message: error.message,
        name: error.name,
        ...(options.debug ? { stack: error.stack } : {}),
      },
      null,
      2
    );
  }

  const lines: string[] = [`Error: ${error.message}`];

  if (options.debug && error.stack) {
    lines.push("");
    lines.push("Stack trace:");
    lines.push(error.stack);
  }

  return lines.join("\n");
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format date for display.
 */
function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
