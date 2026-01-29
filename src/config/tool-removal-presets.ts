/**
 * Tool Removal Presets
 *
 * Built-in presets and resolution logic for tool removal configuration.
 */

import type {
	ResolvedToolRemovalOptions,
	ToolRemovalOptions,
	ToolRemovalPreset,
} from "../types/index.js";

/**
 * Built-in presets for tool removal.
 *
 * | Preset     | Keep | Truncate | Result                        |
 * |------------|------|----------|-------------------------------|
 * | default    | 20   | 50%      | 10 truncated, 10 full fidelity|
 * | aggressive | 10   | 50%      | 5 truncated, 5 full fidelity  |
 * | extreme    | 0    | 0%       | All tools removed             |
 */
export const BUILT_IN_PRESETS: Record<string, ToolRemovalPreset> = {
	default: { name: "default", keepTurnsWithTools: 20, truncatePercent: 50 },
	aggressive: {
		name: "aggressive",
		keepTurnsWithTools: 10,
		truncatePercent: 50,
	},
	extreme: { name: "extreme", keepTurnsWithTools: 0, truncatePercent: 0 },
};

/**
 * Check if a preset name is valid (built-in or custom).
 *
 * @param name - Preset name to check
 * @param customPresets - Optional custom presets from configuration
 * @returns true if the preset name is valid
 */
export function isValidPresetName(
	name: string,
	customPresets?: Record<string, ToolRemovalPreset>,
): boolean {
	if (name in BUILT_IN_PRESETS) {
		return true;
	}
	if (customPresets && name in customPresets) {
		return true;
	}
	return false;
}

/**
 * Resolve a preset by name.
 *
 * @param name - Preset name to resolve
 * @param customPresets - Optional custom presets from configuration
 * @returns The resolved preset
 * @throws Error if preset name is unknown
 */
export function resolvePreset(
	name: string,
	customPresets?: Record<string, ToolRemovalPreset>,
): ToolRemovalPreset {
	if (name in BUILT_IN_PRESETS) {
		return BUILT_IN_PRESETS[name];
	}
	if (customPresets && name in customPresets) {
		return customPresets[name];
	}
	throw new Error(`Unknown preset: ${name}`);
}

/**
 * Resolve tool removal options to fully specified values.
 *
 * Takes optional preset name and optional overrides, returns resolved options.
 *
 * @param options - Tool removal options (may have preset name and/or overrides)
 * @param customPresets - Optional custom presets from configuration
 * @returns Fully resolved options with all values specified
 */
export function resolveToolRemovalOptions(
	options: ToolRemovalOptions,
	customPresets?: Record<string, ToolRemovalPreset>,
): ResolvedToolRemovalOptions {
	const presetName = options.preset ?? "default";
	const preset = resolvePreset(presetName, customPresets);

	return {
		keepTurnsWithTools: options.keepTurnsWithTools ?? preset.keepTurnsWithTools,
		truncatePercent: options.truncatePercent ?? preset.truncatePercent,
	};
}

/**
 * List all available preset names (built-in and custom).
 *
 * @param customPresets - Optional custom presets from configuration
 * @returns Array of preset names
 */
export function listAvailablePresets(
	customPresets?: Record<string, ToolRemovalPreset>,
): string[] {
	const names = Object.keys(BUILT_IN_PRESETS);
	if (customPresets) {
		// Add custom presets that don't shadow built-in ones at the end
		for (const name of Object.keys(customPresets)) {
			if (!names.includes(name)) {
				names.push(name);
			}
		}
	}
	return names;
}
