/**
 * Type definitions for tool and thinking block removal.
 */

import type { SessionLineItem } from "./session-line-item-types.js";

/**
 * A turn represents one user input through the final assistant response.
 * A turn starts when a user sends text content (not a tool result).
 */
export interface TurnBoundary {
  /** Index of the first entry in this turn */
  startIndex: number;
  /** Index of the last entry in this turn */
  endIndex: number;
  /** Index of this turn (0-based) */
  turnIndex: number;
}

/**
 * Options for tool removal operations.
 */
export interface ToolRemovalOptions {
  /** Percentage of turns from which to remove tools (0-100) */
  toolRemovalPercentage: number;
  /** Whether to truncate tools that aren't removed */
  truncateRemainingTools: boolean;
  /** Percentage of turns from which to remove thinking blocks (0-100) */
  thinkingRemovalPercentage: number;
}

/**
 * Resolved tool removal options with defaults applied.
 */
export interface ResolvedToolRemovalOptions {
  /** Percentage of turns from which to remove tools (0-100) */
  toolRemovalPercentage: number;
  /** Whether to truncate tools that aren't removed */
  truncateRemainingTools: boolean;
  /** Percentage of turns from which to remove thinking blocks (always 100 when tools touched) */
  thinkingRemovalPercentage: number;
}

/**
 * Statistics from tool removal operations.
 */
export interface ToolRemovalStatistics {
  /** Number of tool_use blocks completely removed */
  toolCallsRemoved: number;
  /** Number of tool_use/tool_result blocks truncated */
  toolCallsTruncated: number;
  /** Number of thinking blocks removed */
  thinkingBlocksRemoved: number;
  /** Total number of turns in the session */
  totalTurns: number;
  /** Number of turns affected by removal */
  turnsAffected: number;
}

/**
 * Result of tool removal operations.
 */
export interface ToolRemovalResult {
  /** The processed entries with tools/thinking removed */
  processedEntries: SessionLineItem[];
  /** Statistics about what was removed */
  statistics: ToolRemovalStatistics;
}

/**
 * Result of content truncation.
 */
export interface TruncationResult {
  /** The truncated value */
  result: unknown;
  /** Whether truncation occurred */
  wasTruncated: boolean;
}
