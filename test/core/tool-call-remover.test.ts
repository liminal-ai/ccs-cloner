/**
 * Tests for tool-call-remover.ts
 *
 * Tests the "keep last N turns-with-tools" algorithm:
 * - Identifies turns with tool calls
 * - Keeps last N of those
 * - Truncates oldest X% of kept turns
 * - Removes all tools from turns before kept
 * - Removes all thinking blocks when any tools are touched
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
	removeToolCallsFromHistory,
	truncateObjectValues,
	truncateTaskNotificationContent,
	truncateToolContent,
} from "../../src/core/tool-call-remover.js";
import { parseSessionContent } from "../../src/io/session-file-reader.js";
import type { SessionLineItem } from "../../src/types/index.js";

const FIXTURES_DIR = join(__dirname, "../fixtures");

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a session with a specified number of turns that have tool calls.
 * Each tool-turn has a user message, assistant with tool_use, user with tool_result,
 * and final assistant response.
 */
function createSessionWithToolTurns(toolTurnCount: number): SessionLineItem[] {
	const entries: SessionLineItem[] = [];
	let parentUuid: string | undefined;

	for (let i = 0; i < toolTurnCount; i++) {
		const userUuid = `user-${i}`;
		const assistantToolUuid = `assistant-tool-${i}`;
		const userResultUuid = `user-result-${i}`;
		const assistantResponseUuid = `assistant-response-${i}`;

		// User message (starts turn)
		entries.push({
			type: "user",
			uuid: userUuid,
			parentUuid,
			message: { content: `Turn ${i + 1} user message` },
		});

		// Assistant with tool_use
		entries.push({
			type: "assistant",
			uuid: assistantToolUuid,
			parentUuid: userUuid,
			message: {
				content: [
					{ type: "text", text: `Using tool for turn ${i + 1}` },
					{
						type: "tool_use",
						id: `tool-${i}`,
						name: "read_file",
						input: { path: `file-${i}.txt`, content: "a".repeat(200) },
					},
				],
			},
		});

		// User with tool_result
		entries.push({
			type: "user",
			uuid: userResultUuid,
			parentUuid: assistantToolUuid,
			message: {
				content: [
					{
						type: "tool_result",
						tool_use_id: `tool-${i}`,
						content:
							"b".repeat(200) + "\n" + "c".repeat(200) + "\n" + "d".repeat(200),
						is_error: false,
					},
				],
			},
		});

		// Assistant response
		entries.push({
			type: "assistant",
			uuid: assistantResponseUuid,
			parentUuid: userResultUuid,
			message: {
				content: [{ type: "text", text: `Done with turn ${i + 1}` }],
			},
		});

		parentUuid = assistantResponseUuid;
	}

	return entries;
}

/**
 * Create a session with thinking blocks in addition to tools.
 */
function createSessionWithThinkingBlocks(
	toolTurnCount: number,
): SessionLineItem[] {
	const entries: SessionLineItem[] = [];
	let parentUuid: string | undefined;

	for (let i = 0; i < toolTurnCount; i++) {
		const userUuid = `user-${i}`;
		const assistantToolUuid = `assistant-tool-${i}`;
		const userResultUuid = `user-result-${i}`;
		const assistantResponseUuid = `assistant-response-${i}`;

		// User message
		entries.push({
			type: "user",
			uuid: userUuid,
			parentUuid,
			message: { content: `Turn ${i + 1}` },
		});

		// Assistant with thinking + tool_use
		entries.push({
			type: "assistant",
			uuid: assistantToolUuid,
			parentUuid: userUuid,
			message: {
				content: [
					{
						type: "thinking",
						thinking: `Thinking about turn ${i + 1}`,
						signature: "sig",
					},
					{
						type: "tool_use",
						id: `tool-${i}`,
						name: "read_file",
						input: { path: "test.txt" },
					},
				],
			},
		});

		// User with tool_result
		entries.push({
			type: "user",
			uuid: userResultUuid,
			parentUuid: assistantToolUuid,
			message: {
				content: [
					{
						type: "tool_result",
						tool_use_id: `tool-${i}`,
						content: "result",
						is_error: false,
					},
				],
			},
		});

		// Assistant response with thinking
		entries.push({
			type: "assistant",
			uuid: assistantResponseUuid,
			parentUuid: userResultUuid,
			message: {
				content: [
					{
						type: "thinking",
						thinking: `Concluding turn ${i + 1}`,
						signature: "sig",
					},
					{ type: "text", text: "Done" },
				],
			},
		});

		parentUuid = assistantResponseUuid;
	}

	return entries;
}

/**
 * Append additional tool turns to an existing session.
 * Used to simulate continued work after a clone.
 */
function appendToolTurns(
	entries: SessionLineItem[],
	count: number,
): SessionLineItem[] {
	const result = [...entries];
	const lastEntry = result[result.length - 1];
	let parentUuid = lastEntry?.uuid;
	const startIndex = entries.length;

	for (let i = 0; i < count; i++) {
		const idx = startIndex + i;
		const userUuid = `user-new-${idx}`;
		const assistantToolUuid = `assistant-tool-new-${idx}`;
		const userResultUuid = `user-result-new-${idx}`;
		const assistantResponseUuid = `assistant-response-new-${idx}`;

		result.push({
			type: "user",
			uuid: userUuid,
			parentUuid,
			message: { content: `New turn ${i + 1}` },
		});

		result.push({
			type: "assistant",
			uuid: assistantToolUuid,
			parentUuid: userUuid,
			message: {
				content: [
					{
						type: "tool_use",
						id: `tool-new-${idx}`,
						name: "write_file",
						input: { path: "x.txt" },
					},
				],
			},
		});

		result.push({
			type: "user",
			uuid: userResultUuid,
			parentUuid: assistantToolUuid,
			message: {
				content: [
					{
						type: "tool_result",
						tool_use_id: `tool-new-${idx}`,
						content: "written",
						is_error: false,
					},
				],
			},
		});

		result.push({
			type: "assistant",
			uuid: assistantResponseUuid,
			parentUuid: userResultUuid,
			message: { content: [{ type: "text", text: "OK" }] },
		});

		parentUuid = assistantResponseUuid;
	}

	return result;
}

/**
 * Build a task-notification payload with long result text.
 */
function createTaskNotification(taskId: string, resultLength: number): string {
	return [
		"<task-notification>",
		`<task-id>${taskId}</task-id>`,
		"<status>completed</status>",
		"<summary>Agent finished work</summary>",
		`<result>${"x".repeat(resultLength)}</result>`,
		"</task-notification>",
	].join("\n");
}

/**
 * Count how many turns in entries have tool calls.
 */
function countToolTurnsInEntries(entries: SessionLineItem[]): number {
	// Simple heuristic: count tool_use blocks
	let count = 0;
	for (const entry of entries) {
		if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
			if (
				entry.message.content.some(
					(b) => (b as { type?: string }).type === "tool_use",
				)
			) {
				count++;
			}
		}
	}
	return count;
}

// ============================================================================
// truncateToolContent Tests
// ============================================================================

describe("tool-call-remover", () => {
	describe("truncateToolContent", () => {
		test("returns empty string for empty input", () => {
			expect(truncateToolContent("")).toBe("");
		});

		test("returns short content unchanged", () => {
			expect(truncateToolContent("hello")).toBe("hello");
		});

		test("truncates to 2 lines", () => {
			const input = "line1\nline2\nline3\nline4";
			const result = truncateToolContent(input);
			expect(result).toBe("line1\nline2...");
		});

		test("truncates to 120 characters", () => {
			const longLine = "a".repeat(150);
			const result = truncateToolContent(longLine);
			expect(result.length).toBe(123); // 120 + "..."
			expect(result.endsWith("...")).toBe(true);
		});
	});

	describe("truncateTaskNotificationContent", () => {
		test("preserves non-task-notification content", () => {
			const input = "plain user message";
			expect(truncateTaskNotificationContent(input)).toBe(input);
		});

		test("truncates only the <result> body and preserves header fields", () => {
			const input = createTaskNotification("abc123", 400);
			const result = truncateTaskNotificationContent(input, 150);

			expect(result).toContain("<task-id>abc123</task-id>");
			expect(result).toContain("<status>completed</status>");
			expect(result).toContain("<summary>Agent finished work</summary>");
			expect(result).toContain(" (remaining content truncated)");
			expect(result).toContain("<result>");
			expect(result).toContain("</result>");
		});
	});

	// ============================================================================
	// truncateObjectValues Tests
	// ============================================================================

	describe("truncateObjectValues", () => {
		test("truncates string values in objects", () => {
			const input = { key: "a".repeat(150) };
			const { result, wasTruncated } = truncateObjectValues(input);

			expect(wasTruncated).toBe(true);
			expect((result as { key: string }).key.length).toBe(123);
		});

		test("handles nested objects", () => {
			const input = { outer: { inner: "a".repeat(150) } };
			const { wasTruncated } = truncateObjectValues(input);

			expect(wasTruncated).toBe(true);
		});

		test("handles arrays", () => {
			const input = ["short", "a".repeat(150)];
			const { result, wasTruncated } = truncateObjectValues(input);

			expect(wasTruncated).toBe(true);
			expect((result as string[])[0]).toBe("short");
		});

		test("returns unchanged for non-string primitives", () => {
			expect(truncateObjectValues(42).result).toBe(42);
			expect(truncateObjectValues(true).result).toBe(true);
			expect(truncateObjectValues(null).result).toBe(null);
		});
	});

	// ============================================================================
	// removeToolCallsFromHistory - Extreme Preset (keep 0)
	// ============================================================================

	describe("removeToolCallsFromHistory - extreme preset (keep 0)", () => {
		test("removes all tool calls", () => {
			const entries = createSessionWithToolTurns(10);
			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 0,
				truncatePercent: 0,
			});

			// Verify no tool_use or tool_result blocks remain
			for (const entry of result.processedEntries) {
				if (Array.isArray(entry.message?.content)) {
					expect(
						entry.message.content.every(
							(b) =>
								(b as { type?: string }).type !== "tool_use" &&
								(b as { type?: string }).type !== "tool_result",
						),
					).toBe(true);
				}
			}

			expect(result.statistics.turnsWithToolsTotal).toBe(10);
			expect(result.statistics.turnsWithToolsRemoved).toBe(10);
			expect(result.statistics.turnsWithToolsTruncated).toBe(0);
			expect(result.statistics.turnsWithToolsPreserved).toBe(0);
		});
	});

	// ============================================================================
	// removeToolCallsFromHistory - Default Preset (keep 20, truncate 50%)
	// ============================================================================

	describe("removeToolCallsFromHistory - default preset (keep 20, truncate 50%)", () => {
		test("preserves last N tool-turns with correct truncation split", () => {
			// Create 30 tool-turns
			const entries = createSessionWithToolTurns(30);
			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 20,
				truncatePercent: 50,
			});

			// 30 total, keep 20 -> 10 removed
			// Of 20 kept, 50% truncated -> 10 truncated, 10 preserved
			expect(result.statistics.turnsWithToolsTotal).toBe(30);
			expect(result.statistics.turnsWithToolsRemoved).toBe(10);
			expect(result.statistics.turnsWithToolsTruncated).toBe(10);
			expect(result.statistics.turnsWithToolsPreserved).toBe(10);
		});

		test("handles session with fewer tool-turns than keep value", () => {
			const entries = createSessionWithToolTurns(5);
			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 20,
				truncatePercent: 50,
			});

			// Keep all 5, none removed
			// 50% of 5 = 2 truncated (floor), 3 preserved
			expect(result.statistics.turnsWithToolsRemoved).toBe(0);
			expect(result.statistics.turnsWithToolsTruncated).toBe(2);
			expect(result.statistics.turnsWithToolsPreserved).toBe(3);
		});
	});

	// ============================================================================
	// removeToolCallsFromHistory - Edge Cases
	// ============================================================================

	describe("removeToolCallsFromHistory - edge cases", () => {
		test("session with no tool calls", () => {
			const entries: SessionLineItem[] = [
				{ type: "user", uuid: "u1", message: { content: "Hello" } },
				{
					type: "assistant",
					uuid: "a1",
					parentUuid: "u1",
					message: { content: [{ type: "text", text: "Hi" }] },
				},
			];
			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 20,
				truncatePercent: 50,
			});

			expect(result.statistics.turnsWithToolsTotal).toBe(0);
			expect(result.processedEntries.length).toBe(entries.length);
		});

		test("truncatePercent 0 means no truncation", () => {
			const entries = createSessionWithToolTurns(10);
			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 5,
				truncatePercent: 0,
			});

			expect(result.statistics.turnsWithToolsRemoved).toBe(5);
			expect(result.statistics.turnsWithToolsTruncated).toBe(0);
			expect(result.statistics.turnsWithToolsPreserved).toBe(5);
		});

		test("truncatePercent 100 truncates all kept turns", () => {
			const entries = createSessionWithToolTurns(10);
			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 5,
				truncatePercent: 100,
			});

			expect(result.statistics.turnsWithToolsRemoved).toBe(5);
			expect(result.statistics.turnsWithToolsTruncated).toBe(5);
			expect(result.statistics.turnsWithToolsPreserved).toBe(0);
		});
	});

	// ============================================================================
	// Thinking Block Removal
	// ============================================================================

	describe("thinking block removal", () => {
		test("removes all thinking blocks when tools are touched", () => {
			const entries = createSessionWithThinkingBlocks(5);
			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 3,
				truncatePercent: 50,
			});

			// Verify no thinking blocks remain
			for (const entry of result.processedEntries) {
				if (Array.isArray(entry.message?.content)) {
					expect(
						entry.message.content.every(
							(b) => (b as { type?: string }).type !== "thinking",
						),
					).toBe(true);
				}
			}

			// Each tool turn has 2 thinking blocks (one in tool call, one in response)
			expect(result.statistics.thinkingBlocksRemoved).toBe(10);
		});

		test("does not remove thinking blocks when no tools exist", () => {
			const entries: SessionLineItem[] = [
				{ type: "user", uuid: "u1", message: { content: "Hello" } },
				{
					type: "assistant",
					uuid: "a1",
					parentUuid: "u1",
					message: {
						content: [
							{ type: "thinking", thinking: "Let me think", signature: "sig" },
							{ type: "text", text: "Hi" },
						],
					},
				},
			];

			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 20,
				truncatePercent: 50,
			});

			// Thinking should remain because no tools were touched
			const assistantEntry = result.processedEntries.find(
				(e) => e.uuid === "a1",
			);
			expect(assistantEntry).toBeDefined();
			const hasThinking = (
				assistantEntry!.message?.content as Array<{ type: string }>
			).some((b) => b.type === "thinking");
			expect(hasThinking).toBe(true);
			expect(result.statistics.thinkingBlocksRemoved).toBe(0);
		});
	});

	describe("task telemetry cleanup", () => {
		test("removes queue-operation and progress entries when tools are touched", () => {
			const taskNotification = createTaskNotification("agent-123", 1000);
			const entries: SessionLineItem[] = [
				{ type: "user", uuid: "u1", message: { content: "Start" } },
				{
					type: "assistant",
					uuid: "a1",
					parentUuid: "u1",
					message: {
						content: [
							{
								type: "tool_use",
								id: "tool-1",
								name: "Task",
								input: { prompt: "run task", run_in_background: true },
							},
						],
					},
				},
				{
					type: "user",
					uuid: "u2",
					parentUuid: "a1",
					message: {
						content: [
							{
								type: "tool_result",
								tool_use_id: "tool-1",
								content:
									"Async agent launched successfully.\nagentId: agent-123",
								is_error: false,
							},
						],
					},
				},
				{
					type: "queue-operation",
					timestamp: "2026-02-15T00:00:00.000Z",
					sessionId: "s1",
					operation: "enqueue",
					content: taskNotification,
				},
				{
					type: "user",
					uuid: "u3",
					parentUuid: "u2",
					message: { content: taskNotification },
				},
				{ type: "progress", uuid: "p1", parentUuid: "u3" },
				{
					type: "assistant",
					uuid: "a2",
					parentUuid: "p1",
					message: { content: [{ type: "text", text: "Done" }] },
				},
			];

			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 0,
				truncatePercent: 0,
			});

			expect(
				result.processedEntries.some((e) => e.type === "queue-operation"),
			).toBe(false);
			expect(result.processedEntries.some((e) => e.type === "progress")).toBe(
				false,
			);

			const notificationEntry = result.processedEntries.find(
				(e) =>
					e.type === "user" &&
					typeof e.message?.content === "string" &&
					e.message.content.startsWith("<task-notification>"),
			);

			expect(notificationEntry).toBeDefined();
			const notificationContent = notificationEntry!.message!.content as string;
			expect(notificationContent).toContain("<task-id>agent-123</task-id>");
			expect(notificationContent).toContain("<status>completed</status>");
			expect(notificationContent).toContain(
				"<summary>Agent finished work</summary>",
			);
			expect(notificationContent).toContain(" (remaining content truncated)");
		});

		test("does not alter queue/progress/task-notification when no tools exist", () => {
			const taskNotification = createTaskNotification("agent-xyz", 1000);
			const entries: SessionLineItem[] = [
				{ type: "user", uuid: "u1", message: { content: "Hello" } },
				{
					type: "assistant",
					uuid: "a1",
					parentUuid: "u1",
					message: { content: [{ type: "text", text: "Hi" }] },
				},
				{
					type: "queue-operation",
					timestamp: "2026-02-15T00:00:00.000Z",
					sessionId: "s1",
					operation: "enqueue",
					content: taskNotification,
				},
				{ type: "progress", uuid: "p1", parentUuid: "a1" },
				{
					type: "user",
					uuid: "u2",
					parentUuid: "p1",
					message: { content: taskNotification },
				},
			];

			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 20,
				truncatePercent: 50,
			});

			expect(
				result.processedEntries.some((e) => e.type === "queue-operation"),
			).toBe(true);
			expect(result.processedEntries.some((e) => e.type === "progress")).toBe(
				true,
			);

			const notificationEntry = result.processedEntries.find(
				(e) =>
					e.type === "user" &&
					typeof e.message?.content === "string" &&
					e.message.content.startsWith("<task-notification>"),
			);
			expect(notificationEntry).toBeDefined();
			expect(notificationEntry!.message!.content).toBe(taskNotification);
		});
	});

	// ============================================================================
	// Multi-Clone Degradation Prevention (Key Acceptance Test)
	// ============================================================================

	describe("multi-clone degradation prevention", () => {
		test("second clone behaves same as first clone", () => {
			// Simulate first clone: 50 tool-turns -> keep 20
			const session1 = createSessionWithToolTurns(50);
			const clone1 = removeToolCallsFromHistory(session1, {
				keepTurnsWithTools: 20,
				truncatePercent: 50,
			});

			expect(clone1.statistics.turnsWithToolsTotal).toBe(50);
			expect(clone1.statistics.turnsWithToolsRemoved).toBe(30);
			expect(clone1.statistics.turnsWithToolsTruncated).toBe(10);
			expect(clone1.statistics.turnsWithToolsPreserved).toBe(10);

			// After clone1, we have 20 tool-turns remaining
			const clone1ToolTurns = countToolTurnsInEntries(clone1.processedEntries);
			expect(clone1ToolTurns).toBe(20);

			// Simulate continued work: add 30 more tool-turns to cloned session
			// Result: 20 tool-turns from clone1 + 30 new = 50 tool-turns
			const extended = appendToolTurns(clone1.processedEntries, 30);
			const extendedToolTurns = countToolTurnsInEntries(extended);
			expect(extendedToolTurns).toBe(50);

			// Second clone should behave identically to first
			const clone2 = removeToolCallsFromHistory(extended, {
				keepTurnsWithTools: 20,
				truncatePercent: 50,
			});

			// Key assertion: same preservation counts regardless of clone history
			expect(clone2.statistics.turnsWithToolsTotal).toBe(50);
			expect(clone2.statistics.turnsWithToolsRemoved).toBe(30);
			expect(clone2.statistics.turnsWithToolsTruncated).toBe(10);
			expect(clone2.statistics.turnsWithToolsPreserved).toBe(10);

			// After clone2, we should have 20 tool-turns again
			const clone2ToolTurns = countToolTurnsInEntries(clone2.processedEntries);
			expect(clone2ToolTurns).toBe(20);
		});

		test("third clone also behaves consistently", () => {
			// This tests that the new algorithm truly solves the degradation problem
			const session = createSessionWithToolTurns(30);

			// Clone 1
			const clone1 = removeToolCallsFromHistory(session, {
				keepTurnsWithTools: 10,
				truncatePercent: 50,
			});
			expect(clone1.statistics.turnsWithToolsRemoved).toBe(20);
			expect(clone1.statistics.turnsWithToolsTruncated).toBe(5);
			expect(clone1.statistics.turnsWithToolsPreserved).toBe(5);

			// Add 20 more, clone again
			const extended1 = appendToolTurns(clone1.processedEntries, 20);
			const clone2 = removeToolCallsFromHistory(extended1, {
				keepTurnsWithTools: 10,
				truncatePercent: 50,
			});
			expect(clone2.statistics.turnsWithToolsRemoved).toBe(20);
			expect(clone2.statistics.turnsWithToolsTruncated).toBe(5);
			expect(clone2.statistics.turnsWithToolsPreserved).toBe(5);

			// Add 20 more, clone again
			const extended2 = appendToolTurns(clone2.processedEntries, 20);
			const clone3 = removeToolCallsFromHistory(extended2, {
				keepTurnsWithTools: 10,
				truncatePercent: 50,
			});
			expect(clone3.statistics.turnsWithToolsRemoved).toBe(20);
			expect(clone3.statistics.turnsWithToolsTruncated).toBe(5);
			expect(clone3.statistics.turnsWithToolsPreserved).toBe(5);
		});
	});

	// ============================================================================
	// Tool Result Edge Cases
	// ============================================================================

	describe("tool_result-only turns", () => {
		test("treats turns with only tool_result (no tool_use) as tool-bearing", () => {
			// This can happen when a previous clone removed tool_use but left orphaned tool_results,
			// or when the session was manually edited. Such turns should be counted and processed.
			const entries: SessionLineItem[] = [
				// Normal turn without tools
				{ type: "user", uuid: "u1", message: { content: "Hello" } },
				{
					type: "assistant",
					uuid: "a1",
					parentUuid: "u1",
					message: { content: [{ type: "text", text: "Hi there" }] },
				},
				// Turn with orphaned tool_result only (no tool_use)
				{
					type: "user",
					uuid: "u2",
					parentUuid: "a1",
					message: { content: "Do something" },
				},
				{
					type: "assistant",
					uuid: "a2",
					parentUuid: "u2",
					message: { content: [{ type: "text", text: "OK, using tool" }] },
				},
				// Orphaned tool_result - the tool_use was removed but this remains
				{
					type: "user",
					uuid: "u3",
					parentUuid: "a2",
					message: {
						content: [
							{
								type: "tool_result",
								tool_use_id: "orphaned-tool-id",
								content: "tool output",
								is_error: false,
							},
						],
					},
				},
				{
					type: "assistant",
					uuid: "a3",
					parentUuid: "u3",
					message: { content: [{ type: "text", text: "Done" }] },
				},
			];

			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 0, // Remove all tool turns
				truncatePercent: 0,
			});

			// The turn with the orphaned tool_result should be detected as a tool turn
			expect(result.statistics.turnsWithToolsTotal).toBe(1);
			expect(result.statistics.turnsWithToolsRemoved).toBe(1);

			// However, the orphaned tool_result is NOT removed because there's no matching
			// tool_use ID in the removed set. This is documented behavior - orphaned tool_results
			// without matching tool_use entries are preserved (safe behavior).
			const hasOrphanedToolResult = result.processedEntries.some((e) => {
				if (!Array.isArray(e.message?.content)) {
					return false;
				}
				return e.message.content.some(
					(b) =>
						(b as { type?: string; tool_use_id?: string }).type ===
							"tool_result" &&
						(b as { tool_use_id?: string }).tool_use_id === "orphaned-tool-id",
				);
			});
			expect(hasOrphanedToolResult).toBe(true);
		});
	});

	// ============================================================================
	// toolUseResult Stripping
	// ============================================================================

	describe("toolUseResult stripping", () => {
		/**
		 * Create entries with toolUseResult (Claude Code's local full tool output).
		 * This field sits alongside message.content on user tool-result entries.
		 */
		function createSessionWithToolUseResult(
			toolTurnCount: number,
		): SessionLineItem[] {
			const entries: SessionLineItem[] = [];
			let parentUuid: string | undefined;

			for (let i = 0; i < toolTurnCount; i++) {
				const userUuid = `user-${i}`;
				const assistantToolUuid = `assistant-tool-${i}`;
				const userResultUuid = `user-result-${i}`;
				const assistantResponseUuid = `assistant-response-${i}`;

				entries.push({
					type: "user",
					uuid: userUuid,
					parentUuid,
					message: { content: `Turn ${i + 1} user message` },
				});

				entries.push({
					type: "assistant",
					uuid: assistantToolUuid,
					parentUuid: userUuid,
					message: {
						content: [
							{ type: "text", text: `Using tool for turn ${i + 1}` },
							{
								type: "tool_use",
								id: `tool-${i}`,
								name: "read_file",
								input: { path: `file-${i}.txt`, content: "a".repeat(200) },
							},
						],
					},
				});

				// User with tool_result AND toolUseResult (the full raw output)
				entries.push({
					type: "user",
					uuid: userResultUuid,
					parentUuid: assistantToolUuid,
					toolUseResult: {
						type: "text",
						file: {
							filePath: `file-${i}.txt`,
							content: "x".repeat(10000),
						},
					},
					message: {
						content: [
							{
								type: "tool_result",
								tool_use_id: `tool-${i}`,
								content:
									"b".repeat(200) +
									"\n" +
									"c".repeat(200) +
									"\n" +
									"d".repeat(200),
								is_error: false,
							},
						],
					},
				} as SessionLineItem);

				entries.push({
					type: "assistant",
					uuid: assistantResponseUuid,
					parentUuid: userResultUuid,
					message: {
						content: [{ type: "text", text: `Done with turn ${i + 1}` }],
					},
				});

				parentUuid = assistantResponseUuid;
			}

			return entries;
		}

		test("removes toolUseResult from entries in removed zone", () => {
			const entries = createSessionWithToolUseResult(10);

			// Verify toolUseResult exists before removal
			const beforeCount = entries.filter((e) => "toolUseResult" in e).length;
			expect(beforeCount).toBe(10);

			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 0,
				truncatePercent: 0,
			});

			// All tool entries should be deleted entirely (extreme removes everything)
			const afterCount = result.processedEntries.filter(
				(e) => "toolUseResult" in e,
			).length;
			expect(afterCount).toBe(0);
		});

		test("removes toolUseResult from entries in truncated zone", () => {
			// 5 turns, keep all 5, truncate 80% = 4 truncated, 1 full
			const entries = createSessionWithToolUseResult(5);

			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 5,
				truncatePercent: 80,
			});

			// 4 truncated turns should have toolUseResult stripped
			// 1 preserved turn should still have it
			const withToolUseResult = result.processedEntries.filter(
				(e) => "toolUseResult" in e,
			);
			expect(withToolUseResult.length).toBe(1);
		});

		test("preserves toolUseResult on full-fidelity entries", () => {
			// 3 turns, keep all 3, truncate 0% = all preserved
			const entries = createSessionWithToolUseResult(3);

			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 3,
				truncatePercent: 0,
			});

			const withToolUseResult = result.processedEntries.filter(
				(e) => "toolUseResult" in e,
			);
			expect(withToolUseResult.length).toBe(3);
		});

		test("stripping toolUseResult significantly reduces serialized size", () => {
			// 5 turns with 10KB toolUseResult each = ~50KB in toolUseResult alone
			const entries = createSessionWithToolUseResult(5);
			const beforeSize = JSON.stringify(entries).length;

			// Keep all 5, truncate all 5
			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 5,
				truncatePercent: 100,
			});
			const afterSize = JSON.stringify(result.processedEntries).length;

			// Should save most of the ~50KB toolUseResult content
			expect(afterSize).toBeLessThan(beforeSize * 0.5);
		});
	});

	// ============================================================================
	// Fixture-Based Tests
	// ============================================================================

	describe("fixture-based tests", () => {
		test("handles tool_use without id and tool_result without tool_use_id gracefully", () => {
			const content = readFileSync(
				join(FIXTURES_DIR, "session-with-tool-edgecases.jsonl"),
				"utf-8",
			);
			const entries = parseSessionContent(content);

			const result = removeToolCallsFromHistory(entries, {
				keepTurnsWithTools: 0,
				truncatePercent: 0,
			});

			// Should not throw, should handle gracefully
			expect(result.processedEntries.length).toBeGreaterThan(0);

			// Tool_use blocks without IDs should still be removed (removed by type)
			const hasToolUse = result.processedEntries.some((e) => {
				if (!Array.isArray(e.message?.content)) {
					return false;
				}
				return e.message.content.some(
					(b) => (b as { type?: string }).type === "tool_use",
				);
			});
			expect(hasToolUse).toBe(false);

			// Tool_result without tool_use_id is NOT removed - can't match to removed tool_use
			// This is correct/safe behavior
			const hasToolResult = result.processedEntries.some((e) => {
				if (!Array.isArray(e.message?.content)) {
					return false;
				}
				return e.message.content.some(
					(b) => (b as { type?: string }).type === "tool_result",
				);
			});
			expect(hasToolResult).toBe(true); // Orphaned tool_result remains
		});
	});
});
