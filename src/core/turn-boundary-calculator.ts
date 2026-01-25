/**
 * Turn Boundary Calculator
 *
 * Identifies turn boundaries in a session. A turn starts when a user
 * sends text content (not a tool result).
 */

import type { SessionLineItem, ContentBlock, TurnBoundary } from "../types/index.js";

/**
 * Determines if an entry represents the start of a new turn.
 *
 * A new turn starts when a user sends text content (not a tool result).
 * Tool results are continuations of the current turn, not new turns.
 *
 * @param entry - Session entry to check
 * @returns true if this entry starts a new turn
 */
export function isNewUserTurn(entry: SessionLineItem): boolean {
  if (entry.type !== "user") {
    return false;
  }

  // Meta messages (system-injected) are not turns
  if (entry.isMeta === true) {
    return false;
  }

  const content = entry.message?.content;

  // String content = human input (new turn)
  if (typeof content === "string") {
    return true;
  }

  // Array content - check block types
  if (Array.isArray(content)) {
    const hasText = content.some((b) => isTextBlock(b));
    const hasToolResult = content.some((b) => isToolResultBlock(b));

    // New turn = has text but NOT tool_result
    // (tool_result alone means tool response within current turn)
    return hasText && !hasToolResult;
  }

  return false;
}

/**
 * Type guard for text blocks.
 */
function isTextBlock(block: unknown): boolean {
  return typeof block === "object" && block !== null && (block as ContentBlock).type === "text";
}

/**
 * Type guard for tool result blocks.
 */
function isToolResultBlock(block: unknown): boolean {
  return (
    typeof block === "object" && block !== null && (block as ContentBlock).type === "tool_result"
  );
}

/**
 * Identify turn boundaries in a session.
 *
 * A turn starts when a user entry has text content (not tool_result).
 * Tool result entries are continuations of the current turn, not new turns.
 *
 * @param entries - Array of session entries
 * @returns Array of turn boundaries with start/end indices
 */
export function identifyTurnBoundaries(entries: SessionLineItem[]): TurnBoundary[] {
  const turns: TurnBoundary[] = [];
  let currentTurnStart: number | null = null;
  let turnIndex = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (isNewUserTurn(entry)) {
      // Close previous turn if exists
      if (currentTurnStart !== null) {
        turns.push({
          startIndex: currentTurnStart,
          endIndex: i - 1,
          turnIndex: turnIndex++,
        });
      }
      // Start new turn
      currentTurnStart = i;
    }
  }

  // Close final turn
  if (currentTurnStart !== null) {
    turns.push({
      startIndex: currentTurnStart,
      endIndex: entries.length - 1,
      turnIndex,
    });
  }

  return turns;
}

/**
 * Count the number of turns in a session.
 *
 * @param entries - Array of session entries
 * @returns Number of turns
 */
export function countTurns(entries: SessionLineItem[]): number {
  return identifyTurnBoundaries(entries).length;
}
