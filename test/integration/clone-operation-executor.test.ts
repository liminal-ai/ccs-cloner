/**
 * Integration test for executeCloneOperation end-to-end with a temp Claude dir.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile, readFile, stat } from "fs/promises";
import { join } from "path";

import { executeCloneOperation } from "../../src/core/clone-operation-executor.js";
import { parseSessionContent } from "../../src/io/session-file-reader.js";
import { readSessionsIndex } from "../../src/io/session-index-updater.js";
import { validateParentChain } from "../../src/core/parent-chain-repairer.js";

const TEST_DIR = join(__dirname, "../.test-tmp-integration");
const CLAUDE_DIR = join(TEST_DIR, ".claude");
const PROJECT_DIR = join(CLAUDE_DIR, "projects", "-Users-test-project");
const FIXTURES_DIR = join(__dirname, "../fixtures");

describe("executeCloneOperation (integration)", () => {
  beforeEach(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test("clones a session end-to-end and writes output + todos + session-env + sessions-index", async () => {
    const sourceSessionId = "source-session-1";
    const sourcePath = join(PROJECT_DIR, `${sourceSessionId}.jsonl`);

    const fixture = await readFile(join(FIXTURES_DIR, "session-with-filterables.jsonl"), "utf-8");
    await writeFile(sourcePath, fixture, "utf-8");

    const result = await executeCloneOperation({
      sourceSessionId,
      claudeDataDirectory: CLAUDE_DIR,
    });

    expect(result.operationSucceeded).toBe(true);
    expect(result.sourceSessionId).toBe(sourceSessionId);
    expect(result.sourceSessionFilePath).toBe(sourcePath);

    // Output file exists and matches reported path
    await stat(result.clonedSessionFilePath);

    expect(result.clonedSessionFilePath).toBe(join(PROJECT_DIR, `${result.clonedSessionId}.jsonl`));

    const outputContent = await readFile(result.clonedSessionFilePath, "utf-8");
    const outputEntries = parseSessionContent(outputContent);

    // Summary entry is created and prepended
    expect(outputEntries[0].type).toBe("summary");
    expect(typeof outputEntries[0].summary).toBe("string");
    expect((outputEntries[0].summary as string).startsWith("Clone:")).toBe(true);
    expect(typeof outputEntries[0].leafUuid).toBe("string");

    // Must have actual content entries (not just summary)
    const nonSummaryEntries = outputEntries.filter((e) => e.type !== "summary");
    expect(nonSummaryEntries.length).toBeGreaterThan(0);

    // All entries with sessionId should have the new cloned sessionId
    const entriesWithSessionId = outputEntries.filter((e) => e.sessionId !== undefined);
    for (const entry of entriesWithSessionId) {
      expect(entry.sessionId).toBe(result.clonedSessionId);
    }

    // Summary's leafUuid must match the last entry's uuid
    const lastEntry = outputEntries[outputEntries.length - 1];
    expect(outputEntries[0].leafUuid).toBe(lastEntry.uuid);

    // Filtered markers should not appear in output history
    expect(outputEntries.some((e) => e.type === "file-history-snapshot")).toBe(false);
    expect(outputEntries.some((e) => e.isApiErrorMessage === true)).toBe(false);
    expect(outputEntries.some((e) => e.message?.model === "<synthetic>")).toBe(false);

    // Parent chain should be valid after repair (summary has no uuid)
    expect(validateParentChain(outputEntries)).toEqual([]);

    // Stats reflect what this fixture triggers
    expect(result.operationStatistics.entriesFiltered).toBe(3);
    expect(result.operationStatistics.orphanedEntriesDiscarded).toBe(1);
    expect(result.operationStatistics.turnCountOriginal).toBe(1);
    expect(result.operationStatistics.turnCountOutput).toBe(1);

    // Internal output should produce todos + session-env + sessions-index
    const todosPath = join(
      CLAUDE_DIR,
      "todos",
      `${result.clonedSessionId}-agent-${result.clonedSessionId}.json`
    );
    expect((await readFile(todosPath, "utf-8")).trim()).toBe("[]");

    const sessionEnvPath = join(CLAUDE_DIR, "session-env", result.clonedSessionId);
    const envStat = await stat(sessionEnvPath);
    expect(envStat.isDirectory()).toBe(true);

    const index = await readSessionsIndex(PROJECT_DIR);
    expect(index).not.toBeNull();
    expect(index!.entries.some((e) => e.sessionId === result.clonedSessionId)).toBe(true);
  });
});
