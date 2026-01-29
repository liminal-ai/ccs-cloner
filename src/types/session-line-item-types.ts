/**
 * Type definitions for Claude Code session line items.
 *
 * Based on Claude Code session storage format specification v1.1.0
 */

/**
 * Base content block within a message (assistant or user).
 */
export interface ContentBlock {
	type: string;
	[key: string]: unknown;
}

/**
 * Text content block.
 */
export interface TextBlock extends ContentBlock {
	type: "text";
	text: string;
}

/**
 * Tool use content block (assistant requesting tool execution).
 */
export interface ToolUseBlock extends ContentBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: Record<string, unknown>;
}

/**
 * Tool result content block (user providing tool result).
 */
export interface ToolResultBlock extends ContentBlock {
	type: "tool_result";
	tool_use_id: string;
	content: unknown;
	is_error: boolean;
}

/**
 * Thinking content block (extended thinking).
 */
export interface ThinkingBlock extends ContentBlock {
	type: "thinking";
	thinking: string;
	signature: string;
}

/**
 * Conversation message structure embedded in session line items.
 */
export interface ConversationMessage {
	role?: string;
	model?: string;
	content?: ContentBlock[] | string;
	stop_reason?: string | null;
	[key: string]: unknown;
}

/**
 * Session line item types as they appear in JSONL files.
 */
export type SessionLineItemType =
	| "user"
	| "assistant"
	| "summary"
	| "file-history-snapshot";

/**
 * Session line item - one line in a JSONL session file.
 *
 * This is the primary data structure for session entries.
 */
export interface SessionLineItem {
	/** Entry type: user, assistant, summary, or file-history-snapshot */
	type: SessionLineItemType | string;
	/** Unique identifier for this entry */
	uuid?: string;
	/** UUID of the parent entry in the conversation tree */
	parentUuid?: string | null;
	/** Session identifier */
	sessionId?: string | null;
	/** Current working directory when entry was created */
	cwd?: string;
	/** Protocol version */
	version?: string;
	/** Git branch at time of entry */
	gitBranch?: string;
	/** Whether this is a sidechain conversation */
	isSidechain?: boolean;
	/** User type identifier */
	userType?: string;
	/** ISO 8601 timestamp when entry was created */
	timestamp?: string;
	/** Whether this is a meta/system message */
	isMeta?: boolean;
	/** Whether this entry is an API error message */
	isApiErrorMessage?: boolean;
	/** The conversation message content */
	message?: ConversationMessage;
	/** Summary text (for summary entries) */
	summary?: string;
	/** UUID of the leaf node this summary points to */
	leafUuid?: string;
	/** Message ID reference (for file-history-snapshot) */
	messageId?: string;
	/** Whether this is a snapshot update */
	isSnapshotUpdate?: boolean;
	/** Snapshot data */
	snapshot?: unknown;
	/** Allow additional properties */
	[key: string]: unknown;
}

/**
 * Session index entry structure (from sessions-index.json).
 */
export interface SessionIndexEntry {
	sessionId: string;
	fullPath: string;
	fileMtime: number;
	firstPrompt: string;
	summary: string;
	messageCount: number;
	created: string;
	modified: string;
	projectPath: string;
	isSidechain: boolean;
}

/**
 * Sessions index file structure.
 */
export interface SessionsIndex {
	version: number;
	entries: SessionIndexEntry[];
}
