/**
 * Tests for session-directory-scanner.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import {
  findSessionFileById,
  isPathInsideClaudeDir,
  encodeProjectPath,
  decodeProjectPath,
} from "../../src/io/session-directory-scanner.js";
import { SessionNotFoundError } from "../../src/errors/clone-operation-errors.js";

const TEST_DIR = join(__dirname, "../.test-tmp-scanner");
const CLAUDE_DIR = join(TEST_DIR, ".claude");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

describe("session-directory-scanner", () => {
  beforeEach(async () => {
    await mkdir(PROJECTS_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("findSessionFileById", () => {
    test("finds a regular session file across project directories", async () => {
      const projectDir = join(PROJECTS_DIR, "-Users-test-projectA");
      await mkdir(projectDir, { recursive: true });

      const sessionId = "session-123";
      const sessionPath = join(projectDir, `${sessionId}.jsonl`);
      await writeFile(sessionPath, '{"type":"user"}\n', "utf-8");

      const found = await findSessionFileById(sessionId, CLAUDE_DIR);

      expect(found).toBe(sessionPath);
    });

    test("finds an agent session file (agent-<id>.jsonl)", async () => {
      const projectDir = join(PROJECTS_DIR, "-Users-test-projectB");
      await mkdir(projectDir, { recursive: true });

      const sessionId = "agent-session-456";
      const sessionPath = join(projectDir, `agent-${sessionId}.jsonl`);
      await writeFile(sessionPath, '{"type":"user"}\n', "utf-8");

      const found = await findSessionFileById(sessionId, CLAUDE_DIR);

      expect(found).toBe(sessionPath);
    });

    test("throws SessionNotFoundError when no matching file exists", async () => {
      await expect(findSessionFileById("missing-session", CLAUDE_DIR)).rejects.toThrow(
        SessionNotFoundError
      );
    });
  });

  describe("isPathInsideClaudeDir", () => {
    test("returns true for claudeDir itself and nested paths, and false for prefix lookalikes", () => {
      expect(isPathInsideClaudeDir(CLAUDE_DIR, CLAUDE_DIR)).toBe(true);
      expect(isPathInsideClaudeDir(join(CLAUDE_DIR, "projects", "x", "y.jsonl"), CLAUDE_DIR)).toBe(
        true
      );

      // Should not match siblings like ".claude-backup"
      expect(
        isPathInsideClaudeDir(join(TEST_DIR, ".claude-backup", "projects", "x"), CLAUDE_DIR)
      ).toBe(false);
    });
  });

  describe("path encoding", () => {
    test("encodes slashes as dashes and decodes leading-dash paths back to slash paths", () => {
      expect(encodeProjectPath("/Users/alice/project")).toBe("-Users-alice-project");
      expect(decodeProjectPath("-Users-alice-project")).toBe("/Users/alice/project");

      // Non-leading-dash folder names are returned as-is
      expect(decodeProjectPath("plain-folder")).toBe("plain-folder");
    });

    test("decode is lossy for original paths containing dashes (documented limitation)", () => {
      const original = "/Users/alice/foo-bar";
      const encoded = encodeProjectPath(original); // "-Users-alice-foo-bar"
      const decoded = decodeProjectPath(encoded); // "/Users/alice/foo/bar"

      expect(encoded).toBe("-Users-alice-foo-bar");
      expect(decoded).toBe("/Users/alice/foo/bar");
      expect(decoded).not.toBe(original);
    });
  });
});
