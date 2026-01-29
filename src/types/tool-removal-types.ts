/**
 * Type definitions for tool and thinking block removal.
 *
 * The tool removal model uses presets that define:
 * - How many turns-with-tools to keep (newest)
 * - What percentage of kept turns to truncate (oldest portion of kept)
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
 * A preset defines tool removal behavior.
 */
export interface ToolRemovalPreset {
  /** Name of the preset */
  name: string;
  /** How many turns-with-tools to keep (newest first) */
  keepTurnsWithTools: number;
  /** Percentage of kept turns to truncate (oldest portion of kept, 0-100) */
  truncatePercent: number;
}

/**
 * Options for tool removal operations.
 * Can specify a preset name, or override individual values.
 */
export interface ToolRemovalOptions {
  /** Preset name to use (default: "default") */
  preset?: string;
  /** Override: how many turns-with-tools to keep */
  keepTurnsWithTools?: number;
  /** Override: percentage of kept turns to truncate */
  truncatePercent?: number;
}

/**
 * Resolved tool removal options with all values specified.
 * This is what the algorithm actually uses.
 */
export interface ResolvedToolRemovalOptions {
  /** How many turns-with-tools to keep (newest first) */
  keepTurnsWithTools: number;
  /** Percentage of kept turns to truncate (oldest portion of kept, 0-100) */
  truncatePercent: number;
}

/**
 * Statistics from tool removal operations.
 */
export interface ToolRemovalStatistics {
  /** Total number of turns that had tool calls */
  turnsWithToolsTotal: number;
  /** Number of turns with tools fully removed */
  turnsWithToolsRemoved: number;
  /** Number of turns with tools truncated */
  turnsWithToolsTruncated: number;
  /** Number of turns with tools preserved at full fidelity */
  turnsWithToolsPreserved: number;
  /** Number of individual tool_use blocks removed */
  toolCallsRemoved: number;
  /** Number of individual tool_use/tool_result blocks truncated */
  toolCallsTruncated: number;
  /** Number of thinking blocks removed */
  thinkingBlocksRemoved: number;
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
