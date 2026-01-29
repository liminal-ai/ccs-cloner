/**
 * Session Line Item Filter
 *
 * Filters out entries that shouldn't be cloned:
 * - API error messages
 * - Synthetic messages (model === '<synthetic>')
 * - Old summary entries (we create a fresh one)
 * - file-history-snapshot entries (references external backup files)
 */

import type { FilteredEntriesResult, SessionLineItem } from "../types/index.js";

/**
 * Filter out entries that shouldn't be cloned.
 *
 * Removes:
 * - API error messages (isApiErrorMessage: true)
 * - Synthetic messages (model === '<synthetic>')
 * - Old summary entries (type === 'summary')
 * - file-history-snapshot entries (type === 'file-history-snapshot')
 *
 * @param entries - Array of session entries
 * @returns Filtered entries and count of entries removed
 */
export function filterCloneableEntries(
	entries: SessionLineItem[],
): FilteredEntriesResult {
	const original = entries.length;
	const filtered = entries.filter((entry) => {
		// Remove API error messages
		if (entry.isApiErrorMessage) {
			return false;
		}

		// Remove synthetic messages
		if (entry.message?.model === "<synthetic>") {
			return false;
		}

		// Remove old summary entries (we create a fresh one)
		if (entry.type === "summary") {
			return false;
		}

		// Remove file-history-snapshot entries (references external backup files)
		if (entry.type === "file-history-snapshot") {
			return false;
		}

		// Keep everything else
		return true;
	});

	return {
		entries: filtered,
		filteredCount: original - filtered.length,
	};
}

/**
 * Check if an entry is a user message with actual content.
 *
 * @param entry - Session entry to check
 * @returns true if entry is a user message with content
 */
export function isUserMessageEntry(entry: SessionLineItem): boolean {
	return entry.type === "user" && entry.message?.content !== undefined;
}

/**
 * Check if an entry is an assistant message.
 *
 * @param entry - Session entry to check
 * @returns true if entry is an assistant message
 */
export function isAssistantMessageEntry(entry: SessionLineItem): boolean {
	return entry.type === "assistant" && entry.message !== undefined;
}
