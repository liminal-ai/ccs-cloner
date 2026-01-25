/**
 * Tests for active-branch-extractor.ts
 */

import { describe, test, expect } from "bun:test";
import {
  extractActiveBranchFromSession,
  buildUuidGraphFromEntries,
  findLeafUuidFromEntries,
  walkParentChainToRoot,
  findSummaryLeafUuid,
} from "../../src/core/active-branch-extractor.js";
import { parseSessionContent } from "../../src/io/session-file-reader.js";
import { readFileSync } from "fs";
import { join } from "path";
import type { SessionLineItem } from "../../src/types/index.js";

const FIXTURES_DIR = join(__dirname, "../fixtures");

describe("active-branch-extractor", () => {
  describe("buildUuidGraphFromEntries", () => {
    test("builds graph with correct parent-child relationships", () => {
      const content = readFileSync(join(FIXTURES_DIR, "linear-session.jsonl"), "utf-8");
      const entries = parseSessionContent(content);

      const graph = buildUuidGraphFromEntries(entries);

      // Should have 4 entries with UUIDs (summary doesn't have uuid)
      expect(graph.nodes.size).toBe(4);

      // Check parent-child relationships
      const entry1 = graph.nodes.get("entry-1");
      expect(entry1).toBeDefined();
      expect(entry1!.parentUuid).toBeNull();
      expect(entry1!.childUuids).toContain("entry-2");

      const entry4 = graph.nodes.get("entry-4");
      expect(entry4).toBeDefined();
      expect(entry4!.parentUuid).toBe("entry-3");
      expect(entry4!.childUuids).toHaveLength(0);

      // entry-4 should be a leaf
      expect(graph.leafUuids).toContain("entry-4");

      // entry-1 should be a root
      expect(graph.rootUuids).toContain("entry-1");
    });

    test("identifies multiple leaves in branched session", () => {
      const content = readFileSync(join(FIXTURES_DIR, "branched-session.jsonl"), "utf-8");
      const entries = parseSessionContent(content);

      const graph = buildUuidGraphFromEntries(entries);

      // Should have multiple leaves
      expect(graph.leafUuids.length).toBeGreaterThan(1);

      // Both entry-10 (active) and entry-9-orphan should be leaves
      expect(graph.leafUuids).toContain("entry-10");
      expect(graph.leafUuids).toContain("entry-9-orphan");
    });
  });

  describe("findLeafUuidFromEntries", () => {
    test("prefers summary.leafUuid when valid", () => {
      const content = readFileSync(join(FIXTURES_DIR, "branched-session.jsonl"), "utf-8");
      const entries = parseSessionContent(content);
      const graph = buildUuidGraphFromEntries(entries);

      const leafUuid = findLeafUuidFromEntries(entries, graph, {
        preferredLeafUuid: "entry-10",
      });

      expect(leafUuid).toBe("entry-10");
    });

    test("falls back to latest timestamp when preferred not in graph", () => {
      const content = readFileSync(join(FIXTURES_DIR, "branched-session.jsonl"), "utf-8");
      const entries = parseSessionContent(content);
      const graph = buildUuidGraphFromEntries(entries);

      const leafUuid = findLeafUuidFromEntries(entries, graph, {
        preferredLeafUuid: "non-existent",
      });

      // Should pick entry-9-orphan because it has the latest timestamp among leaves
      // (10:01:10 vs 10:00:35)
      expect(leafUuid).toBe("entry-9-orphan");
    });

    test("uses latest timestamp leaf when no preference given", () => {
      const content = readFileSync(join(FIXTURES_DIR, "branched-session.jsonl"), "utf-8");
      const entries = parseSessionContent(content);
      const graph = buildUuidGraphFromEntries(entries);

      const leafUuid = findLeafUuidFromEntries(entries, graph);

      // Without preference, picks latest timestamp
      expect(leafUuid).toBe("entry-9-orphan");
    });
  });

  describe("walkParentChainToRoot", () => {
    test("walks from leaf to root correctly", () => {
      const content = readFileSync(join(FIXTURES_DIR, "linear-session.jsonl"), "utf-8");
      const entries = parseSessionContent(content);
      const graph = buildUuidGraphFromEntries(entries);

      const chain = walkParentChainToRoot("entry-4", graph);

      expect(chain).toEqual(["entry-1", "entry-2", "entry-3", "entry-4"]);
    });

    test("throws on cycle detection", () => {
      const entries: SessionLineItem[] = [
        { type: "user", uuid: "a", parentUuid: "b", message: { content: "hi" } },
        { type: "assistant", uuid: "b", parentUuid: "a", message: { content: [] } },
      ];
      const graph = buildUuidGraphFromEntries(entries);

      expect(() => walkParentChainToRoot("a", graph)).toThrow("Cycle detected");
    });

    test("walks correct branch in branched session", () => {
      const content = readFileSync(join(FIXTURES_DIR, "branched-session.jsonl"), "utf-8");
      const entries = parseSessionContent(content);
      const graph = buildUuidGraphFromEntries(entries);

      // Walk from entry-10 (active branch)
      const activeChain = walkParentChainToRoot("entry-10", graph);

      expect(activeChain).toEqual([
        "entry-1",
        "entry-2",
        "entry-3",
        "entry-4",
        "entry-5",
        "entry-6",
        "entry-9",
        "entry-10",
      ]);

      // Walk from entry-9-orphan (orphan branch)
      const orphanChain = walkParentChainToRoot("entry-9-orphan", graph);

      expect(orphanChain).toEqual([
        "entry-1",
        "entry-2",
        "entry-3",
        "entry-7-orphan",
        "entry-8-orphan",
        "entry-9-orphan",
      ]);
    });
  });

  describe("findSummaryLeafUuid", () => {
    test("extracts leafUuid from summary entry", () => {
      const content = readFileSync(join(FIXTURES_DIR, "branched-session.jsonl"), "utf-8");
      const entries = parseSessionContent(content);

      const leafUuid = findSummaryLeafUuid(entries);

      expect(leafUuid).toBe("entry-10");
    });

    test("returns undefined when no summary", () => {
      const entries = [{ type: "user", uuid: "1", message: { content: "hi" } }];

      const leafUuid = findSummaryLeafUuid(entries);

      expect(leafUuid).toBeUndefined();
    });
  });

  describe("extractActiveBranchFromSession", () => {
    test("extracts linear session completely", () => {
      const content = readFileSync(join(FIXTURES_DIR, "linear-session.jsonl"), "utf-8");
      const entries = parseSessionContent(content);

      const result = extractActiveBranchFromSession(entries, "entry-4");

      // Summary is discarded (we create a fresh one during clone)
      // 5 total entries, 4 in active branch, 1 summary discarded
      expect(result.extractionStatistics.orphanedEntriesDiscarded).toBe(1);
      expect(result.extractionStatistics.totalEntriesInFile).toBe(5);
      expect(result.extractionStatistics.entriesInActiveBranch).toBe(4);
      expect(result.leafNodeUuid).toBe("entry-4");
      expect(result.rootNodeUuid).toBe("entry-1");
    });

    test("discards orphaned branch entries", () => {
      const content = readFileSync(join(FIXTURES_DIR, "branched-session.jsonl"), "utf-8");
      const entries = parseSessionContent(content);

      // Use the summary's leafUuid (entry-10) to select active branch
      const result = extractActiveBranchFromSession(entries, "entry-10");

      // Should discard: 3 orphan entries + 1 summary = 4 total
      expect(result.extractionStatistics.orphanedEntriesDiscarded).toBe(4);
      expect(result.extractionStatistics.totalEntriesInFile).toBe(12);
      expect(result.extractionStatistics.entriesInActiveBranch).toBe(8);

      // Should not include orphan UUIDs
      const activeUuids = result.entriesInActiveChain.filter((e) => e.uuid).map((e) => e.uuid);

      expect(activeUuids).not.toContain("entry-7-orphan");
      expect(activeUuids).not.toContain("entry-8-orphan");
      expect(activeUuids).not.toContain("entry-9-orphan");

      // Should include active branch UUIDs
      expect(activeUuids).toContain("entry-10");
      expect(activeUuids).toContain("entry-6");
    });

    test("throws on empty session", () => {
      expect(() => extractActiveBranchFromSession([])).toThrow("Session has no entries");
    });
  });
});
