/**
 * Tool Call Remover
 *
 * Removes tool_use blocks, tool_result blocks, and thinking blocks
 * from session entries based on "keep last N turns-with-tools" model.
 *
 * Algorithm:
 * 1. Find turns that have tool calls
 * 2. Keep the last N of those turns
 * 3. Of kept turns, truncate oldest X%
 * 4. Remove tools from everything else
 * 5. Always remove thinking blocks when any tools are touched
 */

import type {
  SessionLineItem,
  ContentBlock,
  ResolvedToolRemovalOptions,
  ToolRemovalResult,
  ToolRemovalStatistics,
  TruncationResult,
  TurnBoundary,
} from "../types/index.js";
import { identifyTurnBoundaries } from "./turn-boundary-calculator.js";

/**
 * Check if a turn has any tool calls (tool_use or tool_result blocks).
 *
 * Note: This intentionally treats turns containing only tool_result blocks
 * (without corresponding tool_use) as tool-bearing turns. This can occur when:
 * - A previous clone removed the tool_use but left orphaned tool_results
 * - The session was manually edited
 *
 * This behavior is conservative: such turns are included in the "turns with tools"
 * count and subject to the same keep/truncate/remove logic. This ensures orphaned
 * tool_results are eventually cleaned up through the removal process rather than
 * persisting indefinitely.
 *
 * @param entries - All session entries
 * @param turn - Turn boundary to check
 * @returns true if the turn contains tool calls
 */
function turnHasTools(entries: SessionLineItem[], turn: TurnBoundary): boolean {
  for (let i = turn.startIndex; i <= turn.endIndex; i++) {
    const entry = entries[i];
    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      const content = entry.message.content as ContentBlock[];
      if (content.some((b) => b.type === "tool_use")) {
        return true;
      }
    }
    // Also check for tool_result blocks in user messages. A turn with only
    // tool_result (no tool_use) is still considered tool-bearing for removal
    // purposes. See note above.
    if (entry.type === "user" && Array.isArray(entry.message?.content)) {
      const content = entry.message.content as ContentBlock[];
      if (content.some((b) => b.type === "tool_result")) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Remove tool calls and thinking blocks from session entries.
 *
 * Uses "keep last N turns-with-tools" model:
 * - Identifies all turns that have tool calls
 * - Keeps the last N of those turns (N = options.keepTurnsWithTools)
 * - Of kept turns, truncates the oldest X% (X = options.truncatePercent)
 * - Removes tools from all other turns
 * - Always removes all thinking blocks when any tools are touched
 *
 * @param entries - Session entries to process
 * @param options - Removal options (keepTurnsWithTools, truncatePercent)
 * @returns Processed entries and removal statistics
 */
export function removeToolCallsFromHistory(
  entries: SessionLineItem[],
  options: ResolvedToolRemovalOptions
): ToolRemovalResult {
  const turns = identifyTurnBoundaries(entries);

  // Step 1: Find turns with tools
  const turnsWithTools = turns.filter((turn) => turnHasTools(entries, turn));
  const totalToolTurns = turnsWithTools.length;

  // We need to know if we're touching any tools (for thinking block removal)
  const willTouchTools = totalToolTurns > 0;

  // Step 2: Calculate zones based on "keep last N"
  const keep = Math.min(options.keepTurnsWithTools, totalToolTurns);

  // Split: removed | truncated | preserved
  // turnsWithTools is in chronological order (oldest first)
  const removedToolTurns = keep > 0 ? turnsWithTools.slice(0, -keep) : turnsWithTools;
  const keptToolTurns = keep > 0 ? turnsWithTools.slice(-keep) : [];

  // Of kept turns, truncate oldest X%
  // Rounding: Math.floor - e.g., 50% of 5 = 2 truncated, 3 preserved
  const truncateCount = Math.floor((keptToolTurns.length * options.truncatePercent) / 100);
  const truncatedToolTurns = keptToolTurns.slice(0, truncateCount);
  const preservedToolTurns = keptToolTurns.slice(truncateCount);

  // Step 3: Build lookup sets for O(1) zone detection
  const removedTurnIndices = new Set(removedToolTurns.map((t) => t.turnIndex));
  const truncatedTurnIndices = new Set(truncatedToolTurns.map((t) => t.turnIndex));
  // preservedTurnIndices = everything else in keptToolTurns (no modification needed)

  // Statistics tracking
  let toolCallsRemoved = 0;
  let toolCallsTruncated = 0;
  let thinkingBlocksRemoved = 0;
  const entriesToDelete = new Set<number>();

  // Deep clone entries to avoid mutation
  const modifiedEntries: SessionLineItem[] = entries.map(
    (entry) => JSON.parse(JSON.stringify(entry)) as SessionLineItem
  );

  // First pass: Collect all tool_use IDs that need to be removed
  const toolUseIdsToRemove = new Set<string>();
  for (const turn of removedToolTurns) {
    for (let i = turn.startIndex; i <= turn.endIndex; i++) {
      const entry = modifiedEntries[i];
      if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
        const content = entry.message.content as ContentBlock[];
        for (const block of content) {
          if (block.type === "tool_use" && "id" in block) {
            toolUseIdsToRemove.add(block.id as string);
          }
        }
      }
    }
  }

  // Build a map from entry index to turn index for quick lookup
  const entryToTurnIndex = new Map<number, number>();
  for (const turn of turns) {
    for (let i = turn.startIndex; i <= turn.endIndex; i++) {
      entryToTurnIndex.set(i, turn.turnIndex);
    }
  }

  // Process each entry
  for (let i = 0; i < modifiedEntries.length; i++) {
    if (entriesToDelete.has(i)) {
      continue;
    }

    const entry = modifiedEntries[i];
    const turnIndex = entryToTurnIndex.get(i);
    const isInRemovedZone = turnIndex !== undefined && removedTurnIndices.has(turnIndex);
    const isInTruncatedZone = turnIndex !== undefined && truncatedTurnIndices.has(turnIndex);

    let content: ContentBlock[] | null = null;

    if (
      (entry.type === "assistant" || entry.type === "user") &&
      Array.isArray(entry.message?.content)
    ) {
      content = [...(entry.message.content as ContentBlock[])];
    }

    if (!content) {
      continue;
    }

    let contentModified = false;

    // Handle tool_use blocks (for assistant messages)
    if (isInRemovedZone && entry.type === "assistant") {
      // In removed zone: completely remove tool_use blocks
      const beforeLength = content.length;
      content = content.filter((block) => {
        if (block.type === "tool_use") {
          toolCallsRemoved++;
          return false;
        }
        return true;
      });
      if (content.length !== beforeLength) {
        contentModified = true;
      }
    } else if (isInTruncatedZone && entry.type === "assistant") {
      // In truncated zone: truncate tool_use input
      content = content.map((block) => {
        if (block.type === "tool_use" && "input" in block) {
          const { result: truncatedInput, wasTruncated } = truncateObjectValues(
            block.input as Record<string, unknown>
          );
          if (wasTruncated) {
            toolCallsTruncated++;
            contentModified = true;
            return { ...block, input: truncatedInput };
          }
        }
        return block;
      });
    }

    // Handle tool_result blocks (for user messages)
    if (isInRemovedZone && entry.type === "user") {
      // In removed zone: remove tool_results that match removed tool_use IDs
      const beforeLength = content.length;
      content = content.filter((block) => {
        if (
          block.type === "tool_result" &&
          "tool_use_id" in block &&
          toolUseIdsToRemove.has(block.tool_use_id as string)
        ) {
          return false;
        }
        return true;
      });
      if (content.length !== beforeLength) {
        contentModified = true;
      }
    } else if (isInTruncatedZone && entry.type === "user") {
      // In truncated zone: truncate tool_result content
      content = content.map((block) => {
        if (block.type === "tool_result" && "content" in block) {
          const blockContent = block.content;
          if (typeof blockContent === "string") {
            const truncatedContent = truncateToolContent(blockContent);
            if (truncatedContent !== blockContent) {
              toolCallsTruncated++;
              contentModified = true;
              return { ...block, content: truncatedContent };
            }
          } else {
            const { result: truncatedValue, wasTruncated } = truncateObjectValues(blockContent);
            if (wasTruncated) {
              toolCallsTruncated++;
              contentModified = true;
              return { ...block, content: truncatedValue };
            }
          }
        }
        return block;
      });
    }

    // Remove thinking blocks (always remove all when any tools are touched)
    if (willTouchTools && entry.type === "assistant") {
      const beforeLength = content.length;
      content = content.filter((block) => {
        if (block.type === "thinking") {
          thinkingBlocksRemoved++;
          return false;
        }
        return true;
      });
      if (content.length !== beforeLength) {
        contentModified = true;
      }
    }

    // Update or delete entry based on final content
    if (content.length === 0) {
      entriesToDelete.add(i);
    } else if (contentModified && entry.message) {
      modifiedEntries[i] = {
        ...entry,
        message: {
          ...entry.message,
          content,
        },
      };
    }
  }

  // Remove deleted entries
  const finalEntries = modifiedEntries.filter((_, index) => !entriesToDelete.has(index));

  const statistics: ToolRemovalStatistics = {
    turnsWithToolsTotal: totalToolTurns,
    turnsWithToolsRemoved: removedToolTurns.length,
    turnsWithToolsTruncated: truncatedToolTurns.length,
    turnsWithToolsPreserved: preservedToolTurns.length,
    toolCallsRemoved,
    toolCallsTruncated,
    thinkingBlocksRemoved,
  };

  return {
    processedEntries: finalEntries,
    statistics,
  };
}

/**
 * Truncate a string to 2 lines or 120 characters, whichever comes first.
 * Adds '...' suffix when truncated.
 *
 * @param content - String content to truncate
 * @returns Truncated string
 */
export function truncateToolContent(content: string): string {
  if (!content) {
    return content;
  }

  const maxLines = 2;
  const maxChars = 120;

  const lines = content.split("\n");
  let truncated = lines.slice(0, maxLines).join("\n");
  let wasTruncated = lines.length > maxLines;

  if (truncated.length > maxChars) {
    truncated = truncated.slice(0, maxChars);
    wasTruncated = true;
  }

  if (wasTruncated) {
    truncated = truncated.trimEnd() + "...";
  }

  return truncated;
}

/**
 * Truncate string values within an object, preserving structure.
 *
 * @param obj - Object to truncate string values in
 * @returns Object with truncated strings and flag indicating if truncation occurred
 */
export function truncateObjectValues(obj: unknown): TruncationResult {
  if (obj === null || obj === undefined) {
    return { result: obj, wasTruncated: false };
  }

  if (typeof obj === "string") {
    const truncated = truncateToolContent(obj);
    return { result: truncated, wasTruncated: truncated !== obj };
  }

  if (Array.isArray(obj)) {
    let anyTruncated = false;
    const result = obj.map((item) => {
      const { result: truncatedItem, wasTruncated } = truncateObjectValues(item);
      if (wasTruncated) {
        anyTruncated = true;
      }
      return truncatedItem;
    });
    return { result, wasTruncated: anyTruncated };
  }

  if (typeof obj === "object") {
    let anyTruncated = false;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const { result: truncatedValue, wasTruncated } = truncateObjectValues(value);
      if (wasTruncated) {
        anyTruncated = true;
      }
      result[key] = truncatedValue;
    }
    return { result, wasTruncated: anyTruncated };
  }

  // Numbers, booleans, etc - pass through unchanged
  return { result: obj, wasTruncated: false };
}
