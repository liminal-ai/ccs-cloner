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

  // Default percentage of tools to remove when --strip-tools is used without a value
  // (default: 80)
  defaultToolRemovalPercentage: 80,

  // Default output format: "human" or "json"
  // (default: "human")
  outputFormat: "human",

  // Enable verbose output by default
  // (default: false)
  verboseOutput: false,
};

export default config;
