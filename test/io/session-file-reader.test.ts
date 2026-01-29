/**
 * Tests for session-file-reader.ts
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { InvalidSessionError } from "../../src/errors/clone-operation-errors.js";
import {
	extractFirstUserMessage,
	parseSessionContent,
} from "../../src/io/session-file-reader.js";
import type { SessionLineItem } from "../../src/types/index.js";

const FIXTURES_DIR = join(__dirname, "../fixtures");

describe("session-file-reader", () => {
	describe("parseSessionContent", () => {
		test("returns [] for empty/whitespace-only content", () => {
			expect(parseSessionContent(" \n \n")).toEqual([]);
		});

		test("ignores blank lines", () => {
			const entries = parseSessionContent(
				'{"type":"user"}\n\n{"type":"assistant"}\n',
			);
			expect(entries).toHaveLength(2);
			expect(entries[0].type).toBe("user");
			expect(entries[1].type).toBe("assistant");
		});

		test("throws InvalidSessionError with correct filePath and line number", () => {
			const content = '{"type":"user"}\n{not valid json}\n';
			try {
				parseSessionContent(content, "bad.jsonl");
				throw new Error("Expected parseSessionContent to throw");
			} catch (err) {
				expect(err).toBeInstanceOf(InvalidSessionError);
				const e = err as InvalidSessionError;
				expect(e.filePath).toBe("bad.jsonl");
				expect(e.reason).toContain("line 2");
			}
		});
	});

	describe("extractFirstUserMessage", () => {
		test("extracts the first user string message from a fixture session", () => {
			const content = readFileSync(
				join(FIXTURES_DIR, "session-with-filterables.jsonl"),
				"utf-8",
			);
			const entries = parseSessionContent(content);

			expect(extractFirstUserMessage(entries)).toBe("Hello!");
		});

		test("skips tool_result-only user entries and returns the next user text", () => {
			const entries: SessionLineItem[] = [
				{
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
				},
				{
					type: "assistant",
					message: { content: [{ type: "text", text: "assistant" }] },
				},
				{
					type: "user",
					message: { content: [{ type: "text", text: "Real message" }] },
				},
			];

			expect(extractFirstUserMessage(entries)).toBe("Real message");
		});

		test("returns text from array content even when other blocks exist", () => {
			const entries: SessionLineItem[] = [
				{
					type: "user",
					message: {
						content: [
							{
								type: "tool_result",
								tool_use_id: "t1",
								content: "ok",
								is_error: false,
							},
							{ type: "text", text: "Hello from text block" },
						],
					},
				},
			];

			expect(extractFirstUserMessage(entries)).toBe("Hello from text block");
		});

		test("returns empty string when no user text is found", () => {
			const entries: SessionLineItem[] = [
				{
					type: "assistant",
					message: { content: [{ type: "text", text: "hi" }] },
				},
				{
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
				},
			];

			expect(extractFirstUserMessage(entries)).toBe("");
		});
	});
});
