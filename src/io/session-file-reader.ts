/**
 * Session File Reader
 *
 * Handles parsing JSONL session files.
 */

import { readFile } from "fs/promises";
import type { SessionLineItem, ContentBlock } from "../types/index.js";
import { InvalidSessionError, FileOperationError } from "../errors/clone-operation-errors.js";

/**
 * Result of parsing a session file.
 */
export interface ParsedSessionFile {
  /** Parsed session entries */
  entries: SessionLineItem[];
  /** Raw file content */
  rawContent: string;
}

/**
 * Parse a session JSONL file.
 *
 * @param filePath - Path to the session file
 * @returns Parsed entries and raw content
 */
export async function parseSessionFile(filePath: string): Promise<ParsedSessionFile> {
  let rawContent: string;

  try {
    rawContent = await readFile(filePath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FileOperationError(filePath, "read", message);
  }

  const entries = parseSessionContent(rawContent, filePath);

  return { entries, rawContent };
}

/**
 * Parse JSONL content into session entries.
 *
 * @param content - Raw JSONL file content
 * @param filePath - File path for error reporting
 * @returns Array of parsed session entries
 */
export function parseSessionContent(
  content: string,
  filePath: string = "<unknown>"
): SessionLineItem[] {
  const lines = content.trim().split("\n").filter(Boolean);
  const entries: SessionLineItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      const entry = JSON.parse(line) as SessionLineItem;
      entries.push(entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InvalidSessionError(filePath, `Invalid JSON at line ${i + 1}: ${message}`);
    }
  }

  return entries;
}

/**
 * Serialize session entries to JSONL format.
 *
 * @param entries - Array of session entries
 * @returns JSONL string with trailing newline
 */
export function serializeSessionEntries(entries: SessionLineItem[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
}

/**
 * Extract the first user message content from session entries.
 *
 * Finds the first user entry that contains actual text content (not just tool_result blocks).
 *
 * @param entries - Array of session entries
 * @returns First user message text, or empty string if not found
 */
export function extractFirstUserMessage(entries: SessionLineItem[]): string {
  for (const entry of entries) {
    if (entry.type !== "user" || !entry.message?.content) {
      continue;
    }

    const content = entry.message.content;

    // String content is always text
    if (typeof content === "string") {
      return content;
    }

    // For array content, find a text block (not tool_result)
    if (Array.isArray(content)) {
      const textBlock = content.find(
        (b): b is ContentBlock & { text: string } =>
          typeof b === "object" &&
          b !== null &&
          b.type === "text" &&
          typeof (b as { text?: unknown }).text === "string"
      );
      if (textBlock?.text) {
        return textBlock.text;
      }
      // This user entry has no text content, continue searching
    }
  }

  return "";
}

/**
 * Count tool calls in session entries.
 *
 * @param entries - Array of session entries
 * @returns Number of tool_use blocks found
 */
export function countToolCalls(entries: SessionLineItem[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      for (const block of entry.message.content as ContentBlock[]) {
        if (block.type === "tool_use") {
          count++;
        }
      }
    }
  }
  return count;
}

/**
 * Check if session has any thinking blocks.
 *
 * @param entries - Array of session entries
 * @returns true if any thinking blocks found
 */
export function hasThinkingBlocks(entries: SessionLineItem[]): boolean {
  for (const entry of entries) {
    if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
      for (const block of entry.message.content as ContentBlock[]) {
        if (block.type === "thinking") {
          return true;
        }
      }
    }
  }
  return false;
}
