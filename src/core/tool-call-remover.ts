/**
 * Tool Call Remover
 *
 * Removes tool_use blocks, tool_result blocks, and thinking blocks
 * from session entries based on a percentage of turns.
 */

import type {
  SessionLineItem,
  ContentBlock,
  ResolvedToolRemovalOptions,
  ToolRemovalResult,
  ToolRemovalStatistics,
  TruncationResult,
} from "../types/index.js";
import { identifyTurnBoundaries } from "./turn-boundary-calculator.js";

/**
 * Calculate the turn boundary for removal.
 *
 * Uses Math.max(1, Math.floor(...)) when percent > 0 to ensure at least
 * 1 turn is affected. This fixes the bug where small session counts
 * resulted in 0 turns being affected.
 *
 * @param totalTurns - Total number of turns
 * @param removalPercentage - Percentage of turns to affect (0-100)
 * @returns Number of turns to affect
 */
export function calculateTurnBoundaryForRemoval(
  totalTurns: number,
  removalPercentage: number
): number {
  if (removalPercentage === 0) {
    return 0;
  }
  if (removalPercentage >= 100) {
    return totalTurns;
  }
  // Key fix: Use Math.max(1, Math.floor(...)) to ensure at least 1 turn
  // when percentage > 0
  return Math.max(1, Math.floor((totalTurns * removalPercentage) / 100));
}

/**
 * Remove tool calls and thinking blocks from session entries.
 *
 * @param entries - Session entries to process
 * @param options - Removal options
 * @returns Processed entries and removal statistics
 */
export function removeToolCallsFromHistory(
  entries: SessionLineItem[],
  options: ResolvedToolRemovalOptions
): ToolRemovalResult {
  const turns = identifyTurnBoundaries(entries);
  const turnCount = turns.length;

  // Calculate removal boundaries using the fixed algorithm
  const toolBoundary = calculateTurnBoundaryForRemoval(turnCount, options.toolRemovalPercentage);
  const thinkingBoundary = calculateTurnBoundaryForRemoval(
    turnCount,
    options.thinkingRemovalPercentage
  );

  let toolCallsRemoved = 0;
  let toolCallsTruncated = 0;
  let thinkingBlocksRemoved = 0;
  const entriesToDelete = new Set<number>();

  // Deep clone entries to avoid mutation
  const modifiedEntries: SessionLineItem[] = entries.map(
    (entry) => JSON.parse(JSON.stringify(entry)) as SessionLineItem
  );

  // First pass: Collect all tool_use IDs that need to be removed
  // In the removal zone, we ALWAYS remove (never truncate), regardless of truncateRemainingTools flag
  const toolUseIdsToRemove = new Set<string>();
  for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
    const turn = turns[turnIdx];
    const isInToolRemovalZone = turnIdx < toolBoundary;

    if (isInToolRemovalZone) {
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
  }

  // Process each turn
  for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
    const turn = turns[turnIdx];
    const isInToolRemovalZone = turnIdx < toolBoundary;
    const isInThinkingRemovalZone = turnIdx < thinkingBoundary;

    // Process entries in this turn
    for (let i = turn.startIndex; i <= turn.endIndex; i++) {
      if (entriesToDelete.has(i)) {
        continue;
      }

      const entry = modifiedEntries[i];
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
      // In the removal zone, we ALWAYS remove tools (never truncate)
      if (isInToolRemovalZone && entry.type === "assistant") {
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
      }

      // Handle tool_result blocks (for user messages)
      // In the removal zone, we ALWAYS remove tool_results that match removed tool_use IDs
      if (entry.type === "user" && isInToolRemovalZone) {
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
      }

      // Truncate tools OUTSIDE removal zone when requested.
      // The truncateRemainingTools flag should not affect behavior inside the removal zone.
      if (options.truncateRemainingTools && !isInToolRemovalZone) {
        if (entry.type === "assistant") {
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

        if (entry.type === "user") {
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
      }

      // Remove thinking blocks (for assistant messages in removal zone)
      if (isInThinkingRemovalZone && entry.type === "assistant") {
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
  }

  // Remove deleted entries
  const finalEntries = modifiedEntries.filter((_, index) => !entriesToDelete.has(index));

  const statistics: ToolRemovalStatistics = {
    toolCallsRemoved,
    toolCallsTruncated,
    thinkingBlocksRemoved,
    totalTurns: turnCount,
    turnsAffected: toolBoundary,
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
