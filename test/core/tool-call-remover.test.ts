/**
 * Tests for tool-call-remover.ts
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  calculateTurnBoundaryForRemoval,
  removeToolCallsFromHistory,
  truncateToolContent,
  truncateObjectValues,
} from "../../src/core/tool-call-remover.js";
import { parseSessionContent } from "../../src/io/session-file-reader.js";
import type { SessionLineItem, ResolvedToolRemovalOptions } from "../../src/types/index.js";

const FIXTURES_DIR = join(__dirname, "../fixtures");

describe("tool-call-remover", () => {
  describe("calculateTurnBoundaryForRemoval", () => {
    test("returns 0 for 0%", () => {
      expect(calculateTurnBoundaryForRemoval(10, 0)).toBe(0);
      expect(calculateTurnBoundaryForRemoval(100, 0)).toBe(0);
    });

    test("returns totalTurns for 100%", () => {
      expect(calculateTurnBoundaryForRemoval(10, 100)).toBe(10);
      expect(calculateTurnBoundaryForRemoval(5, 100)).toBe(5);
    });

    test("uses Math.max(1, Math.floor()) for small counts - fixes bug", () => {
      // Key bug fix: 3 turns at 80% should be at least 1, not 0
      expect(calculateTurnBoundaryForRemoval(3, 80)).toBe(2); // floor(2.4) = 2

      // 2 turns at 80% = floor(1.6) = 1
      expect(calculateTurnBoundaryForRemoval(2, 80)).toBe(1);

      // 1 turn at 10% = max(1, floor(0.1)) = 1 (ensures at least 1)
      expect(calculateTurnBoundaryForRemoval(1, 10)).toBe(1);

      // 5 turns at 10% = max(1, floor(0.5)) = 1
      expect(calculateTurnBoundaryForRemoval(5, 10)).toBe(1);
    });

    test("calculates correctly for typical values", () => {
      // 10 turns at 80% = 8
      expect(calculateTurnBoundaryForRemoval(10, 80)).toBe(8);

      // 100 turns at 50% = 50
      expect(calculateTurnBoundaryForRemoval(100, 50)).toBe(50);

      // 20 turns at 95% = 19
      expect(calculateTurnBoundaryForRemoval(20, 95)).toBe(19);
    });
  });

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

  describe("removeToolCallsFromHistory", () => {
    const createTestSession = (): SessionLineItem[] => [
      {
        type: "user",
        uuid: "1",
        message: { content: "Turn 1" },
      },
      {
        type: "assistant",
        uuid: "2",
        parentUuid: "1",
        message: {
          content: [
            { type: "thinking", thinking: "Let me think", signature: "sig" },
            { type: "tool_use", id: "t1", name: "read_file", input: { path: "test.txt" } },
          ],
        },
      },
      {
        type: "user",
        uuid: "3",
        parentUuid: "2",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "file content", is_error: false },
          ],
        },
      },
      {
        type: "assistant",
        uuid: "4",
        parentUuid: "3",
        message: {
          content: [{ type: "text", text: "Done" }],
        },
      },
      {
        type: "user",
        uuid: "5",
        parentUuid: "4",
        message: { content: "Turn 2" },
      },
      {
        type: "assistant",
        uuid: "6",
        parentUuid: "5",
        message: {
          content: [
            { type: "thinking", thinking: "Second thought", signature: "sig2" },
            { type: "text", text: "Response" },
          ],
        },
      },
    ];

    test("removes tool calls from specified percentage of turns", () => {
      const entries = createTestSession();
      const options: ResolvedToolRemovalOptions = {
        toolRemovalPercentage: 100,
        truncateRemainingTools: false,
        thinkingRemovalPercentage: 100,
      };

      const result = removeToolCallsFromHistory(entries, options);

      expect(result.statistics.toolCallsRemoved).toBeGreaterThan(0);
    });

    test("removes all thinking blocks when thinkingRemovalPercentage is 100", () => {
      const entries = createTestSession();
      const options: ResolvedToolRemovalOptions = {
        toolRemovalPercentage: 0,
        truncateRemainingTools: false,
        thinkingRemovalPercentage: 100,
      };

      const result = removeToolCallsFromHistory(entries, options);

      // Check that thinking blocks are removed
      for (const entry of result.processedEntries) {
        if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
          for (const block of entry.message.content) {
            expect(block.type).not.toBe("thinking");
          }
        }
      }

      expect(result.statistics.thinkingBlocksRemoved).toBe(2);
    });

    test("always removes tools in removal zone regardless of truncateRemainingTools flag", () => {
      const entries = createTestSession();
      const options: ResolvedToolRemovalOptions = {
        toolRemovalPercentage: 100,
        truncateRemainingTools: true, // This flag doesn't affect removal behavior
        thinkingRemovalPercentage: 0,
      };

      const result = removeToolCallsFromHistory(entries, options);

      // Should have removed tools (truncation only applies outside removal zone)
      expect(result.statistics.toolCallsRemoved).toBeGreaterThan(0);
    });

    test("truncates tools outside removal zone when truncateRemainingTools is true", () => {
      const longInput = { text: "a".repeat(200) };
      const longResult = "b".repeat(200) + "\n" + "c".repeat(200) + "\n" + "d".repeat(200);
      const longArrayResult = [{ type: "text", text: "x".repeat(200) }, { extra: "y".repeat(200) }];

      const entries: SessionLineItem[] = [
        // Turn 1 (removal zone at 50%)
        { type: "user", uuid: "u1", message: { content: "Turn 1" } },
        {
          type: "assistant",
          uuid: "a1",
          parentUuid: "u1",
          message: {
            content: [{ type: "tool_use", id: "t1", name: "read_file", input: longInput }],
          },
        },
        {
          type: "user",
          uuid: "u1r",
          parentUuid: "a1",
          message: {
            content: [
              { type: "tool_result", tool_use_id: "t1", content: longResult, is_error: false },
            ],
          },
        },
        {
          type: "assistant",
          uuid: "a1r",
          parentUuid: "u1r",
          message: { content: [{ type: "text", text: "ok" }] },
        },

        // Turn 2 (outside removal zone)
        { type: "user", uuid: "u2", parentUuid: "a1r", message: { content: "Turn 2" } },
        {
          type: "assistant",
          uuid: "a2",
          parentUuid: "u2",
          message: {
            content: [
              { type: "tool_use", id: "t2", name: "write_file", input: { payload: longInput } },
            ],
          },
        },
        {
          type: "user",
          uuid: "u2r",
          parentUuid: "a2",
          message: {
            content: [
              { type: "tool_result", tool_use_id: "t2", content: longResult, is_error: false },
            ],
          },
        },
        {
          type: "user",
          uuid: "u2r2",
          parentUuid: "a2",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "t2",
                content: longArrayResult,
                is_error: false,
              },
            ],
          },
        },
        {
          type: "assistant",
          uuid: "a2r",
          parentUuid: "u2r2",
          message: { content: [{ type: "text", text: "done" }] },
        },
      ];

      const options: ResolvedToolRemovalOptions = {
        toolRemovalPercentage: 50,
        truncateRemainingTools: true,
        thinkingRemovalPercentage: 0,
      };

      const result = removeToolCallsFromHistory(entries, options);

      // Turn 1 tool should be removed (entry may be deleted if it becomes empty)
      const anyToolUseT1 = result.processedEntries.some((e) => {
        if (!Array.isArray(e.message?.content)) {
          return false;
        }
        return e.message.content.some(
          (b) =>
            (b as { type?: string; id?: string }).type === "tool_use" &&
            (b as { id?: string }).id === "t1"
        );
      });
      expect(anyToolUseT1).toBe(false);

      // Turn 2 tool should still exist but be truncated
      const turn2Assistant = result.processedEntries.find((e) => e.uuid === "a2");
      expect(turn2Assistant).toBeDefined();
      const toolUse = Array.isArray(turn2Assistant!.message?.content)
        ? turn2Assistant!.message!.content.find((b) => (b as { type?: string }).type === "tool_use")
        : undefined;
      expect(toolUse).toBeDefined();
      expect(JSON.stringify((toolUse as { input?: unknown }).input).length).toBeLessThan(
        JSON.stringify({ payload: longInput }).length
      );

      // Turn 2 tool_result should be truncated
      const turn2User = result.processedEntries.find((e) => e.uuid === "u2r");
      expect(turn2User).toBeDefined();
      const toolResult = Array.isArray(turn2User!.message?.content)
        ? turn2User!.message!.content.find((b) => (b as { type?: string }).type === "tool_result")
        : undefined;
      expect(toolResult).toBeDefined();
      expect(((toolResult as { content?: unknown }).content as string).endsWith("...")).toBe(true);

      // Turn 2 tool_result with array content should be truncated (at least one nested string shortened)
      const turn2User2 = result.processedEntries.find((e) => e.uuid === "u2r2");
      expect(turn2User2).toBeDefined();
      const toolResult2 = Array.isArray(turn2User2!.message?.content)
        ? turn2User2!.message!.content.find((b) => (b as { type?: string }).type === "tool_result")
        : undefined;
      expect(toolResult2).toBeDefined();
      const content2 = (toolResult2 as { content?: unknown }).content as unknown;
      expect(Array.isArray(content2)).toBe(true);
      const serialized2 = JSON.stringify(content2);
      expect(serialized2.includes("x".repeat(200))).toBe(false);

      expect(result.statistics.toolCallsRemoved).toBeGreaterThan(0);
      expect(result.statistics.toolCallsTruncated).toBeGreaterThan(0);
    });

    test("preserves entries outside removal zone", () => {
      const entries = createTestSession();
      const options: ResolvedToolRemovalOptions = {
        toolRemovalPercentage: 50, // Only affect first turn
        truncateRemainingTools: false,
        thinkingRemovalPercentage: 50,
      };

      const result = removeToolCallsFromHistory(entries, options);

      // Second turn should still have its content
      const secondTurnAssistant = result.processedEntries.find((e) => e.uuid === "6");
      expect(secondTurnAssistant).toBeDefined();
    });

    test("handles tool_use without id and tool_result without tool_use_id gracefully", () => {
      // This fixture has tool_use without id and tool_result without tool_use_id
      const content = readFileSync(
        join(FIXTURES_DIR, "session-with-tool-edgecases.jsonl"),
        "utf-8"
      );
      const entries = parseSessionContent(content);

      const options: ResolvedToolRemovalOptions = {
        toolRemovalPercentage: 100,
        truncateRemainingTools: false,
        thinkingRemovalPercentage: 0,
      };

      // Should not throw, should handle gracefully
      const result = removeToolCallsFromHistory(entries, options);

      // Should still process without error
      expect(result.processedEntries.length).toBeGreaterThan(0);

      // Tool_use blocks without IDs should still be removed (removed by type)
      const hasToolUse = result.processedEntries.some((e) => {
        if (!Array.isArray(e.message?.content)) {
          return false;
        }
        return e.message.content.some((b) => (b as { type?: string }).type === "tool_use");
      });
      expect(hasToolUse).toBe(false);

      // Tool_result without tool_use_id is NOT removed — can't match to removed tool_use
      // This is correct/safe behavior: we don't remove orphaned tool_results
      const hasToolResult = result.processedEntries.some((e) => {
        if (!Array.isArray(e.message?.content)) {
          return false;
        }
        return e.message.content.some((b) => (b as { type?: string }).type === "tool_result");
      });
      expect(hasToolResult).toBe(true); // Orphaned tool_result remains
    });

    test("truncates tool_use without id when truncateRemainingTools is true", () => {
      // This fixture has tool_use without id
      const content = readFileSync(
        join(FIXTURES_DIR, "session-with-tool-edgecases.jsonl"),
        "utf-8"
      );
      const entries = parseSessionContent(content);

      const options: ResolvedToolRemovalOptions = {
        toolRemovalPercentage: 0, // Don't remove, just truncate
        truncateRemainingTools: true,
        thinkingRemovalPercentage: 0,
      };

      // Should not throw
      const result = removeToolCallsFromHistory(entries, options);
      expect(result.processedEntries.length).toBeGreaterThan(0);
    });
  });
});
