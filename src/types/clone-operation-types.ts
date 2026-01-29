/**
 * Type definitions for clone operations.
 */

import type { ToolRemovalOptions, ToolRemovalPreset } from "./tool-removal-types.js";

/**
 * Options for a clone operation.
 */
export interface CloneOperationOptions {
  /** Session ID to clone */
  sourceSessionId: string;
  /** Tool removal configuration (if any) */
  toolRemovalConfig?: ToolRemovalOptions;
  /** Custom tool removal presets from configuration */
  customPresets?: Record<string, ToolRemovalPreset>;
  /** Custom output path (if not in default location) */
  outputPathOverride?: string;
  /** Claude data directory override */
  claudeDataDirectory?: string;
}

/**
 * Statistics from a clone operation.
 */
export interface CloneOperationStatistics {
  /** Number of turns in the original session */
  turnCountOriginal: number;
  /** Number of turns in the output session */
  turnCountOutput: number;
  /** Number of tool calls completely removed */
  toolCallsRemoved: number;
  /** Number of tool calls truncated */
  toolCallsTruncated: number;
  /** Number of thinking blocks removed */
  thinkingBlocksRemoved: number;
  /** Number of orphaned entries discarded (from branch extraction) */
  orphanedEntriesDiscarded: number;
  /** Number of entries filtered (API errors, synthetic, etc.) */
  entriesFiltered: number;
  /** Percentage reduction in file size */
  fileSizeReductionPercent: number;
  /** Original file size in bytes */
  originalSizeBytes: number;
  /** Output file size in bytes */
  outputSizeBytes: number;
}

/**
 * Result of a clone operation.
 */
export interface CloneOperationResult {
  /** Whether the operation completed successfully */
  operationSucceeded: boolean;
  /** The ID of the cloned session */
  clonedSessionId: string;
  /** Path to the cloned session file */
  clonedSessionFilePath: string;
  /** The source session ID */
  sourceSessionId: string;
  /** Path to the source session file */
  sourceSessionFilePath: string;
  /** Statistics about the operation */
  operationStatistics: CloneOperationStatistics;
}

/**
 * Result of filtering session entries.
 */
export interface FilteredEntriesResult {
  /** The filtered entries */
  entries: SessionLineItem[];
  /** Number of entries that were filtered out */
  filteredCount: number;
}

// Re-import for convenience
import type { SessionLineItem } from "./session-line-item-types.js";
export type { SessionLineItem };

/**
 * Session information for list command.
 */
export interface SessionInfo {
  sessionId: string;
  projectPath: string;
  firstMessage: string;
  turnCount: number;
  createdAt: Date;
  modifiedAt: Date;
  sizeBytes: number;
}

/**
 * Detailed session information for info command.
 */
export interface SessionDetails extends SessionInfo {
  entryCount: number;
  hasThinking: boolean;
  toolCallCount: number;
  filePath: string;
}

/**
 * Options for listing sessions.
 */
export interface ListSessionsOptions {
  /** Filter by project path substring */
  project?: string;
  /** Maximum sessions to return */
  limit?: number;
  /** Claude data directory override */
  claudeDataDirectory?: string;
}

/**
 * Options for getting session info.
 */
export interface SessionInfoOptions {
  /** Session ID to get info for */
  sessionId: string;
  /** Claude data directory override */
  claudeDataDirectory?: string;
}
