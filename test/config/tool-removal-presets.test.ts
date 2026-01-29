/**
 * Tests for tool-removal-presets.ts
 */

import { describe, test, expect } from "bun:test";
import {
  BUILT_IN_PRESETS,
  isValidPresetName,
  resolvePreset,
  resolveToolRemovalOptions,
  listAvailablePresets,
} from "../../src/config/tool-removal-presets.js";
import type { ToolRemovalPreset } from "../../src/types/index.js";

describe("tool-removal-presets", () => {
  describe("BUILT_IN_PRESETS", () => {
    test("has default, aggressive, extreme", () => {
      expect(BUILT_IN_PRESETS.default).toBeDefined();
      expect(BUILT_IN_PRESETS.aggressive).toBeDefined();
      expect(BUILT_IN_PRESETS.extreme).toBeDefined();
    });

    test("default keeps 20 turns, 50% truncate", () => {
      expect(BUILT_IN_PRESETS.default.keepTurnsWithTools).toBe(20);
      expect(BUILT_IN_PRESETS.default.truncatePercent).toBe(50);
    });

    test("aggressive keeps 10 turns, 50% truncate", () => {
      expect(BUILT_IN_PRESETS.aggressive.keepTurnsWithTools).toBe(10);
      expect(BUILT_IN_PRESETS.aggressive.truncatePercent).toBe(50);
    });

    test("extreme keeps 0 turns", () => {
      expect(BUILT_IN_PRESETS.extreme.keepTurnsWithTools).toBe(0);
      expect(BUILT_IN_PRESETS.extreme.truncatePercent).toBe(0);
    });
  });

  describe("isValidPresetName", () => {
    test("returns true for built-in presets", () => {
      expect(isValidPresetName("default")).toBe(true);
      expect(isValidPresetName("aggressive")).toBe(true);
      expect(isValidPresetName("extreme")).toBe(true);
    });

    test("returns false for unknown presets", () => {
      expect(isValidPresetName("unknown")).toBe(false);
      expect(isValidPresetName("foo")).toBe(false);
      expect(isValidPresetName("")).toBe(false);
    });

    test("returns true for custom presets when provided", () => {
      const custom: Record<string, ToolRemovalPreset> = {
        minimal: { name: "minimal", keepTurnsWithTools: 5, truncatePercent: 80 },
      };
      expect(isValidPresetName("minimal", custom)).toBe(true);
    });

    test("returns false for non-existent custom presets", () => {
      const custom: Record<string, ToolRemovalPreset> = {
        minimal: { name: "minimal", keepTurnsWithTools: 5, truncatePercent: 80 },
      };
      expect(isValidPresetName("nonexistent", custom)).toBe(false);
    });
  });

  describe("resolvePreset", () => {
    test("returns built-in preset by name", () => {
      const preset = resolvePreset("aggressive");
      expect(preset.name).toBe("aggressive");
      expect(preset.keepTurnsWithTools).toBe(10);
      expect(preset.truncatePercent).toBe(50);
    });

    test("returns default preset by name", () => {
      const preset = resolvePreset("default");
      expect(preset.name).toBe("default");
      expect(preset.keepTurnsWithTools).toBe(20);
    });

    test("throws for unknown preset", () => {
      expect(() => resolvePreset("unknown")).toThrow("Unknown preset: unknown");
    });

    test("returns custom preset when provided", () => {
      const custom: Record<string, ToolRemovalPreset> = {
        minimal: { name: "minimal", keepTurnsWithTools: 5, truncatePercent: 80 },
      };
      const preset = resolvePreset("minimal", custom);
      expect(preset.name).toBe("minimal");
      expect(preset.keepTurnsWithTools).toBe(5);
      expect(preset.truncatePercent).toBe(80);
    });

    test("built-in presets take precedence over custom with same name", () => {
      const custom: Record<string, ToolRemovalPreset> = {
        default: { name: "default", keepTurnsWithTools: 999, truncatePercent: 99 },
      };
      // Built-in should be returned, not custom
      const preset = resolvePreset("default", custom);
      expect(preset.keepTurnsWithTools).toBe(20); // Built-in value, not 999
    });
  });

  describe("resolveToolRemovalOptions", () => {
    test("uses default preset when no preset specified", () => {
      const resolved = resolveToolRemovalOptions({});
      expect(resolved.keepTurnsWithTools).toBe(20);
      expect(resolved.truncatePercent).toBe(50);
    });

    test("uses specified preset", () => {
      const resolved = resolveToolRemovalOptions({ preset: "aggressive" });
      expect(resolved.keepTurnsWithTools).toBe(10);
      expect(resolved.truncatePercent).toBe(50);
    });

    test("allows override of keepTurnsWithTools", () => {
      const resolved = resolveToolRemovalOptions({
        preset: "default",
        keepTurnsWithTools: 15,
      });
      expect(resolved.keepTurnsWithTools).toBe(15);
      expect(resolved.truncatePercent).toBe(50); // from preset
    });

    test("allows override of truncatePercent", () => {
      const resolved = resolveToolRemovalOptions({
        preset: "default",
        truncatePercent: 75,
      });
      expect(resolved.keepTurnsWithTools).toBe(20); // from preset
      expect(resolved.truncatePercent).toBe(75);
    });

    test("allows override of both values", () => {
      const resolved = resolveToolRemovalOptions({
        preset: "extreme",
        keepTurnsWithTools: 5,
        truncatePercent: 30,
      });
      expect(resolved.keepTurnsWithTools).toBe(5);
      expect(resolved.truncatePercent).toBe(30);
    });

    test("uses custom preset", () => {
      const custom: Record<string, ToolRemovalPreset> = {
        minimal: { name: "minimal", keepTurnsWithTools: 3, truncatePercent: 90 },
      };
      const resolved = resolveToolRemovalOptions({ preset: "minimal" }, custom);
      expect(resolved.keepTurnsWithTools).toBe(3);
      expect(resolved.truncatePercent).toBe(90);
    });

    test("override zero values work correctly", () => {
      // Make sure 0 is treated as a valid override, not as "use preset default"
      const resolved = resolveToolRemovalOptions({
        preset: "default",
        keepTurnsWithTools: 0,
        truncatePercent: 0,
      });
      expect(resolved.keepTurnsWithTools).toBe(0);
      expect(resolved.truncatePercent).toBe(0);
    });
  });

  describe("listAvailablePresets", () => {
    test("lists built-in presets", () => {
      const presets = listAvailablePresets();
      expect(presets).toContain("default");
      expect(presets).toContain("aggressive");
      expect(presets).toContain("extreme");
    });

    test("includes custom presets", () => {
      const custom: Record<string, ToolRemovalPreset> = {
        minimal: { name: "minimal", keepTurnsWithTools: 5, truncatePercent: 80 },
        thorough: { name: "thorough", keepTurnsWithTools: 30, truncatePercent: 30 },
      };
      const presets = listAvailablePresets(custom);
      expect(presets).toContain("default");
      expect(presets).toContain("aggressive");
      expect(presets).toContain("extreme");
      expect(presets).toContain("minimal");
      expect(presets).toContain("thorough");
    });

    test("does not duplicate preset names", () => {
      const custom: Record<string, ToolRemovalPreset> = {
        default: { name: "default", keepTurnsWithTools: 999, truncatePercent: 99 },
      };
      const presets = listAvailablePresets(custom);
      const defaultCount = presets.filter((p) => p === "default").length;
      expect(defaultCount).toBe(1);
    });
  });
});
