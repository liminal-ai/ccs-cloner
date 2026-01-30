/**
 * Tests for --strip-tools=default alias behavior
 *
 * Verifies that "default" is treated as "use configured default preset"
 * rather than the literal built-in "default" preset.
 */

import { describe, expect, test } from "bun:test";

/**
 * This mirrors the isDefaultPreset logic in clone-command.ts.
 * These values all mean "use the configured default preset".
 */
function isDefaultPresetAlias(value: unknown): boolean {
	return (
		value === "" || value === "true" || value === "default" || value === true
	);
}

describe("default preset alias", () => {
	describe("values that trigger config.defaultPreset", () => {
		test("empty string uses configured default", () => {
			expect(isDefaultPresetAlias("")).toBe(true);
		});

		test('"true" string uses configured default', () => {
			expect(isDefaultPresetAlias("true")).toBe(true);
		});

		test('"default" string uses configured default', () => {
			expect(isDefaultPresetAlias("default")).toBe(true);
		});

		test("boolean true uses configured default", () => {
			expect(isDefaultPresetAlias(true)).toBe(true);
		});
	});

	describe("values that use explicit preset name", () => {
		test('"aggressive" uses aggressive preset', () => {
			expect(isDefaultPresetAlias("aggressive")).toBe(false);
		});

		test('"extreme" uses extreme preset', () => {
			expect(isDefaultPresetAlias("extreme")).toBe(false);
		});

		test("custom preset name uses that preset", () => {
			expect(isDefaultPresetAlias("my-custom")).toBe(false);
		});
	});
});
