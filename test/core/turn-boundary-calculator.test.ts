/**
 * Tests for turn-boundary-calculator.ts
 */

import { describe, expect, test } from "bun:test";
import {
	identifyTurnBoundaries,
	isNewUserTurn,
} from "../../src/core/turn-boundary-calculator.js";
import type { SessionLineItem } from "../../src/types/index.js";

describe("turn-boundary-calculator", () => {
	describe("isNewUserTurn", () => {
		test("returns false for non-user entries", () => {
			const entry: SessionLineItem = {
				type: "assistant",
				message: { content: [{ type: "text", text: "hi" }] },
			};
			expect(isNewUserTurn(entry)).toBe(false);
		});

		test("returns false for meta user entries", () => {
			const entry: SessionLineItem = {
				type: "user",
				isMeta: true,
				message: { content: "hello" },
			};
			expect(isNewUserTurn(entry)).toBe(false);
		});

		test("returns true for user string content", () => {
			const entry: SessionLineItem = {
				type: "user",
				message: { content: "hello" },
			};
			expect(isNewUserTurn(entry)).toBe(true);
		});

		test("returns true for user array content with text block(s) only", () => {
			const entry: SessionLineItem = {
				type: "user",
				message: { content: [{ type: "text", text: "hello" }] },
			};
			expect(isNewUserTurn(entry)).toBe(true);
		});

		test("returns false for user array content with tool_result only", () => {
			const entry: SessionLineItem = {
				type: "user",
				message: {
					content: [
						{
							type: "tool_result",
							tool_use_id: "t1",
							content: "ok",
							is_error: false,
						},
					],
				},
			};
			expect(isNewUserTurn(entry)).toBe(false);
		});

		test("returns false for user array content with both text and tool_result blocks", () => {
			const entry: SessionLineItem = {
				type: "user",
				message: {
					content: [
						{ type: "text", text: "hello" },
						{
							type: "tool_result",
							tool_use_id: "t1",
							content: "ok",
							is_error: false,
						},
					],
				},
			};
			expect(isNewUserTurn(entry)).toBe(false);
		});

		test("returns false when user entry has no content", () => {
			const entry: SessionLineItem = {
				type: "user",
				message: {},
			};
			expect(isNewUserTurn(entry)).toBe(false);
		});
	});

	describe("identifyTurnBoundaries", () => {
		test("returns empty array when there are no user turns", () => {
			const entries: SessionLineItem[] = [
				{
					type: "assistant",
					message: { content: [{ type: "text", text: "hi" }] },
				},
				{
					type: "assistant",
					message: { content: [{ type: "text", text: "still hi" }] },
				},
			];

			expect(identifyTurnBoundaries(entries)).toEqual([]);
		});

		test("treats tool_result user entries as continuation, not a new turn", () => {
			const entries: SessionLineItem[] = [
				{
					type: "assistant",
					uuid: "a0",
					message: { content: [{ type: "text", text: "preface" }] },
				},
				{ type: "user", uuid: "u1", message: { content: "Turn 1" } },
				{
					type: "assistant",
					uuid: "a1",
					parentUuid: "u1",
					message: {
						content: [
							{
								type: "tool_use",
								id: "t1",
								name: "read_file",
								input: { path: "x" },
							},
						],
					},
				},
				{
					type: "user",
					uuid: "u1r",
					parentUuid: "a1",
					message: {
						content: [
							{
								type: "tool_result",
								tool_use_id: "t1",
								content: "ok",
								is_error: false,
							},
						],
					},
				},
				{
					type: "assistant",
					uuid: "a2",
					parentUuid: "u1r",
					message: { content: [{ type: "text", text: "done" }] },
				},
				{
					type: "user",
					uuid: "u2",
					parentUuid: "a2",
					message: { content: [{ type: "text", text: "Turn 2" }] },
				},
				{
					type: "assistant",
					uuid: "a3",
					parentUuid: "u2",
					message: { content: [{ type: "text", text: "ok" }] },
				},
			];

			const turns = identifyTurnBoundaries(entries);

			expect(turns).toEqual([
				{ startIndex: 1, endIndex: 4, turnIndex: 0 },
				{ startIndex: 5, endIndex: 6, turnIndex: 1 },
			]);
		});
	});
});
