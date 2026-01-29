/**
 * Tests for parent-chain-repairer.ts
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { parseSessionContent } from "../../src/io/session-file-reader.js";
import {
  repairBrokenParentReferences,
  validateParentChain,
} from "../../src/core/parent-chain-repairer.js";
import type { SessionLineItem } from "../../src/types/index.js";

const FIXTURES_DIR = join(__dirname, "../fixtures");

describe("parent-chain-repairer", () => {
  describe("validateParentChain", () => {
    test("detects invalid parentUuid references", () => {
      const content = readFileSync(join(FIXTURES_DIR, "session-with-bad-parent-chain.jsonl"), "utf-8");
      const entries = parseSessionContent(content);

      const errors = validateParentChain(entries);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("invalid parentUuid");
      expect(errors[0]).toContain("missing-parent-uuid");
    });
  });

  describe("repairBrokenParentReferences", () => {
    test("repairs missing parentUuid by pointing to the last valid uuid before the entry", () => {
      const content = readFileSync(join(FIXTURES_DIR, "session-with-bad-parent-chain.jsonl"), "utf-8");
      const entries = parseSessionContent(content);

      const repaired = repairBrokenParentReferences(entries);

      const repairedEntry3 = repaired.find((e) => e.uuid === "entry-3");
      expect(repairedEntry3).toBeDefined();
      expect(repairedEntry3!.parentUuid).toBe("entry-2");

      expect(validateParentChain(repaired)).toEqual([]);
    });

    test("repairs an invalid parent on the first entry to null", () => {
      const entries: SessionLineItem[] = [
        { type: "user", uuid: "u1", parentUuid: "missing", message: { content: "hi" } },
        { type: "assistant", uuid: "a1", parentUuid: "u1", message: { content: [{ type: "text", text: "ok" }] } },
      ];

      const repaired = repairBrokenParentReferences(entries);

      expect(repaired[0].parentUuid).toBeNull();
      expect(validateParentChain(repaired)).toEqual([]);
    });
  });
});
