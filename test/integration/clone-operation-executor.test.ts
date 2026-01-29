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

  test("clones a session end-to-end without tool removal", async () => {
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

  test("clones a session with preset-based tool removal", async () => {
    const sourceSessionId = "source-session-2";
    const sourcePath = join(PROJECT_DIR, `${sourceSessionId}.jsonl`);

    const fixture = await readFile(join(FIXTURES_DIR, "session-with-filterables.jsonl"), "utf-8");
    await writeFile(sourcePath, fixture, "utf-8");

    const result = await executeCloneOperation({
      sourceSessionId,
      claudeDataDirectory: CLAUDE_DIR,
      toolRemovalConfig: {
        preset: "default",
      },
    });

    expect(result.operationSucceeded).toBe(true);
    expect(result.sourceSessionId).toBe(sourceSessionId);

    // Output file should exist
    await stat(result.clonedSessionFilePath);

    // Stats should be present
    expect(result.operationStatistics.toolCallsRemoved).toBeDefined();
    expect(result.operationStatistics.toolCallsTruncated).toBeDefined();
    expect(result.operationStatistics.thinkingBlocksRemoved).toBeDefined();
  });

  test("clones a session with extreme preset (removes all tools)", async () => {
    const sourceSessionId = "source-session-3";
    const sourcePath = join(PROJECT_DIR, `${sourceSessionId}.jsonl`);

    const fixture = await readFile(join(FIXTURES_DIR, "session-with-filterables.jsonl"), "utf-8");
    await writeFile(sourcePath, fixture, "utf-8");

    const result = await executeCloneOperation({
      sourceSessionId,
      claudeDataDirectory: CLAUDE_DIR,
      toolRemovalConfig: {
        preset: "extreme",
      },
    });

    expect(result.operationSucceeded).toBe(true);

    // With extreme preset (keep 0), all tool turns should be removed
    // The exact count depends on the fixture
    const outputContent = await readFile(result.clonedSessionFilePath, "utf-8");
    const outputEntries = parseSessionContent(outputContent);

    // Verify no tool_use blocks remain
    for (const entry of outputEntries) {
      if (Array.isArray(entry.message?.content)) {
        const hasToolUse = entry.message.content.some(
          (b) => (b as { type?: string }).type === "tool_use"
        );
        expect(hasToolUse).toBe(false);
      }
    }
  });

  test("clones a session with custom preset passed through options", async () => {
    const sourceSessionId = "source-session-4";
    const sourcePath = join(PROJECT_DIR, `${sourceSessionId}.jsonl`);

    // Use the tool-edgecases fixture which has tool calls
    const fixture = await readFile(
      join(FIXTURES_DIR, "session-with-tool-edgecases.jsonl"),
      "utf-8"
    );
    await writeFile(sourcePath, fixture, "utf-8");

    // Define a custom preset and use it
    const customPresets = {
      "my-custom": { name: "my-custom", keepTurnsWithTools: 0, truncatePercent: 0 },
    };

    const result = await executeCloneOperation({
      sourceSessionId,
      claudeDataDirectory: CLAUDE_DIR,
      toolRemovalConfig: {
        preset: "my-custom",
      },
      customPresets,
    });

    expect(result.operationSucceeded).toBe(true);

    // Custom preset with keep=0 should remove all tool calls
    const outputContent = await readFile(result.clonedSessionFilePath, "utf-8");
    const outputEntries = parseSessionContent(outputContent);

    // Verify no tool_use blocks remain (custom preset removes all)
    for (const entry of outputEntries) {
      if (Array.isArray(entry.message?.content)) {
        const hasToolUse = entry.message.content.some(
          (b) => (b as { type?: string }).type === "tool_use"
        );
        expect(hasToolUse).toBe(false);
      }
    }

    // Verify thinking blocks are removed when tools are processed
    for (const entry of outputEntries) {
      if (Array.isArray(entry.message?.content)) {
        const hasThinking = entry.message.content.some(
          (b) => (b as { type?: string }).type === "thinking"
        );
        expect(hasThinking).toBe(false);
      }
    }
  });

  test("fails when using unknown preset without custom presets", async () => {
    const sourceSessionId = "source-session-5";
    const sourcePath = join(PROJECT_DIR, `${sourceSessionId}.jsonl`);

    const fixture = await readFile(
      join(FIXTURES_DIR, "session-with-tool-edgecases.jsonl"),
      "utf-8"
    );
    await writeFile(sourcePath, fixture, "utf-8");

    // Attempt to use a non-existent preset without defining it
    await expect(
      executeCloneOperation({
        sourceSessionId,
        claudeDataDirectory: CLAUDE_DIR,
        toolRemovalConfig: {
          preset: "nonexistent-preset",
        },
        // No customPresets provided
      })
    ).rejects.toThrow("Unknown preset: nonexistent-preset");
  });
});
