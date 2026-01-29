/**
 * Tests for session-line-item-filter.ts
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { parseSessionContent } from "../../src/io/session-file-reader.js";
import { filterCloneableEntries } from "../../src/core/session-line-item-filter.js";
import type { SessionLineItem } from "../../src/types/index.js";

const FIXTURES_DIR = join(__dirname, "../fixtures");

describe("session-line-item-filter", () => {
  describe("filterCloneableEntries", () => {
    test("filters summary, file-history-snapshot, isApiErrorMessage, and <synthetic> model entries", () => {
      const content = readFileSync(join(FIXTURES_DIR, "session-with-filterables.jsonl"), "utf-8");
      const entries = parseSessionContent(content);

      const result = filterCloneableEntries(entries);

      expect(result.filteredCount).toBe(4);
      expect(result.entries.map((e) => e.uuid).filter(Boolean)).toEqual([
        "entry-1",
        "entry-5",
        "entry-6",
      ]);

      // Ensure no filtered markers remain
      expect(result.entries.some((e) => e.type === "summary")).toBe(false);
      expect(result.entries.some((e) => e.type === "file-history-snapshot")).toBe(false);
      expect(result.entries.some((e) => e.isApiErrorMessage === true)).toBe(false);
      expect(result.entries.some((e) => e.message?.model === "<synthetic>")).toBe(false);
    });

    test("keeps entries that don't match any filter rule (including entries without message)", () => {
      const entries: SessionLineItem[] = [
        { type: "user", uuid: "u1" }, // no message
        { type: "assistant", uuid: "a1", message: { content: [{ type: "text", text: "hi" }] } },
      ];

      const result = filterCloneableEntries(entries);

      expect(result.filteredCount).toBe(0);
      expect(result.entries).toHaveLength(2);
    });
  });
});
