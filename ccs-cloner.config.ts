/**
 * Example ccs-cloner configuration file
 *
 * This file shows all available configuration options.
 * Copy to your project root and customize as needed.
 *
 * Configuration is loaded by c12, which searches for:
 * - ccs-cloner.config.ts
 * - ccs-cloner.config.js
 * - .ccs-clonerrc
 * - .ccs-clonerrc.json
 * - .ccs-clonerrc.yaml
 */

import type { UserConfiguration } from "./src/types/index.js";

const config: UserConfiguration = {
  // Override Claude data directory (default: ~/.claude)
  // claudeDataDirectory: "/custom/path/to/.claude",

  // Default preset name for tool removal when --strip-tools is used without a value
  // Built-in presets: "default", "aggressive", "extreme"
  // (default: "default")
  defaultPreset: "default",

  // Custom tool removal presets
  // customPresets: {
  //   minimal: { name: "minimal", keepTurnsWithTools: 5, truncatePercent: 80 },
  //   thorough: { name: "thorough", keepTurnsWithTools: 30, truncatePercent: 30 },
  // },

  // Default output format: "human" or "json"
  // (default: "human")
  outputFormat: "human",

  // Enable verbose output by default
  // (default: false)
  verboseOutput: false,
};

export default config;
