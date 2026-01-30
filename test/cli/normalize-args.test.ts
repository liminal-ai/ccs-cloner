/**
 * Tests for normalize-args.ts
 *
 * Verifies --strip-tools argument normalization to prevent consuming next flag.
 */

import { describe, expect, test } from "bun:test";
import { normalizeStripToolsArg } from "../../src/cli/normalize-args.js";

describe("normalizeStripToolsArg", () => {
	describe("pass-through cases (no transformation needed)", () => {
		test("returns args unchanged when --strip-tools not present", () => {
			const args = ["clone", "session-id", "--dsp", "--json"];
			expect(normalizeStripToolsArg(args)).toEqual(args);
		});

		test("returns args unchanged for --strip-tools=value syntax", () => {
			const args = ["clone", "session-id", "--strip-tools=aggressive", "--dsp"];
			expect(normalizeStripToolsArg(args)).toEqual(args);
		});

		test("returns args unchanged when --strip-tools has explicit value", () => {
			const args = [
				"clone",
				"session-id",
				"--strip-tools",
				"aggressive",
				"--dsp",
			];
			expect(normalizeStripToolsArg(args)).toEqual(args);
		});

		test("returns empty array unchanged", () => {
			expect(normalizeStripToolsArg([])).toEqual([]);
		});
	});

	describe("transformation cases (prevents flag consumption bug)", () => {
		test("transforms --strip-tools --dsp to --strip-tools=default --dsp", () => {
			const args = ["clone", "session-id", "--strip-tools", "--dsp"];
			const normalized = normalizeStripToolsArg(args);
			expect(normalized).toEqual([
				"clone",
				"session-id",
				"--strip-tools=default",
				"--dsp",
			]);
		});

		test("transforms --strip-tools at end of args", () => {
			const args = ["clone", "session-id", "--dsp", "--strip-tools"];
			const normalized = normalizeStripToolsArg(args);
			expect(normalized).toEqual([
				"clone",
				"session-id",
				"--dsp",
				"--strip-tools=default",
			]);
		});

		test("transforms --strip-tools followed by short flag", () => {
			const args = ["clone", "session-id", "--strip-tools", "-v"];
			const normalized = normalizeStripToolsArg(args);
			expect(normalized).toEqual([
				"clone",
				"session-id",
				"--strip-tools=default",
				"-v",
			]);
		});

		test("transforms when --strip-tools is first arg", () => {
			const args = ["--strip-tools", "--dsp", "clone", "session-id"];
			const normalized = normalizeStripToolsArg(args);
			expect(normalized).toEqual([
				"--strip-tools=default",
				"--dsp",
				"clone",
				"session-id",
			]);
		});
	});

	describe("does not mutate original array", () => {
		test("returns new array when transformation occurs", () => {
			const args = ["clone", "session-id", "--strip-tools", "--dsp"];
			const normalized = normalizeStripToolsArg(args);
			expect(normalized).not.toBe(args);
			expect(args[2]).toBe("--strip-tools"); // original unchanged
		});

		test("returns same array reference when no transformation needed", () => {
			const args = ["clone", "session-id", "--dsp"];
			const normalized = normalizeStripToolsArg(args);
			expect(normalized).toBe(args);
		});
	});
});
