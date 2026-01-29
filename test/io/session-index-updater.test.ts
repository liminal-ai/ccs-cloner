/**
 * Tests for session-index-updater.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, readFile, writeFile } from "fs/promises";
import { join } from "path";
import {
  addSessionToIndex,
  readSessionsIndex,
  removeSessionFromIndex,
} from "../../src/io/session-index-updater.js";

const TEST_DIR = join(__dirname, "../.test-tmp-index");
const PROJECT_DIR = join(TEST_DIR, "project");

describe("session-index-updater", () => {
  beforeEach(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("addSessionToIndex", () => {
    test("creates new index when none exists", async () => {
      const sessionPath = join(PROJECT_DIR, "test-session.jsonl");
      await writeFile(sessionPath, '{"type":"user"}\n');

      await addSessionToIndex(PROJECT_DIR, "test-session", sessionPath, {
        firstPrompt: "Hello world",
        messageCount: 1,
        projectPath: "/test/project",
      });

      const index = await readSessionsIndex(PROJECT_DIR);
      expect(index).not.toBeNull();
      expect(index!.entries).toHaveLength(1);
      expect(index!.entries[0].sessionId).toBe("test-session");
    });

    test("appends to existing index", async () => {
      const indexPath = join(PROJECT_DIR, "sessions-index.json");
      await writeFile(
        indexPath,
        JSON.stringify({
          version: 1,
          entries: [
            {
              sessionId: "existing",
              fullPath: "/path/to/existing.jsonl",
              fileMtime: 1000,
              firstPrompt: "Existing",
              summary: "Existing session",
              messageCount: 5,
              created: "2024-01-01T00:00:00Z",
              modified: "2024-01-01T00:00:00Z",
              projectPath: "/test",
              isSidechain: false,
            },
          ],
        })
      );

      const sessionPath = join(PROJECT_DIR, "new-session.jsonl");
      await writeFile(sessionPath, '{"type":"user"}\n');

      await addSessionToIndex(PROJECT_DIR, "new-session", sessionPath, {
        firstPrompt: "New session",
        messageCount: 1,
        projectPath: "/test",
      });

      const index = await readSessionsIndex(PROJECT_DIR);
      expect(index!.entries).toHaveLength(2);
    });

    test("creates backup of existing index", async () => {
      const indexPath = join(PROJECT_DIR, "sessions-index.json");
      const originalContent = JSON.stringify({ version: 1, entries: [] });
      await writeFile(indexPath, originalContent);

      const sessionPath = join(PROJECT_DIR, "test.jsonl");
      await writeFile(sessionPath, '{"type":"user"}\n');

      await addSessionToIndex(PROJECT_DIR, "test", sessionPath, {
        firstPrompt: "Test",
        messageCount: 1,
        projectPath: "/test",
      });

      const backupContent = await readFile(indexPath + ".bak", "utf-8");
      expect(backupContent).toBe(originalContent);
    });
  });

  describe("readSessionsIndex", () => {
    test("returns null for non-existent index", async () => {
      const index = await readSessionsIndex(PROJECT_DIR);
      expect(index).toBeNull();
    });

    test("reads valid index", async () => {
      const indexPath = join(PROJECT_DIR, "sessions-index.json");
      await writeFile(
        indexPath,
        JSON.stringify({
          version: 1,
          entries: [{ sessionId: "test" }],
        })
      );

      const index = await readSessionsIndex(PROJECT_DIR);
      expect(index).not.toBeNull();
      expect(index!.version).toBe(1);
    });
  });

  describe("removeSessionFromIndex", () => {
    test("removes session from index", async () => {
      const indexPath = join(PROJECT_DIR, "sessions-index.json");
      await writeFile(
        indexPath,
        JSON.stringify({
          version: 1,
          entries: [{ sessionId: "keep" }, { sessionId: "remove" }],
        })
      );

      const removed = await removeSessionFromIndex(PROJECT_DIR, "remove");

      expect(removed).toBe(true);

      const index = await readSessionsIndex(PROJECT_DIR);
      expect(index!.entries).toHaveLength(1);
      expect(index!.entries[0].sessionId).toBe("keep");
    });

    test("returns false when session not found", async () => {
      const indexPath = join(PROJECT_DIR, "sessions-index.json");
      await writeFile(
        indexPath,
        JSON.stringify({
          version: 1,
          entries: [{ sessionId: "other" }],
        })
      );

      const removed = await removeSessionFromIndex(PROJECT_DIR, "nonexistent");

      expect(removed).toBe(false);
    });

    test("returns false when index doesn't exist", async () => {
      const removed = await removeSessionFromIndex(PROJECT_DIR, "any");
      expect(removed).toBe(false);
    });
  });
});
