/**
 * Default Configuration
 *
 * Provides default values and environment variable handling.
 */

import { homedir } from "os";
import { join } from "pathe";
import type { ResolvedConfiguration, EnvironmentConfiguration } from "../types/index.js";

/**
 * Get the default Claude data directory.
 *
 * Uses CCS_CLONER_CLAUDE_DIR env var if set, otherwise ~/.claude
 *
 * @returns Absolute path to Claude data directory
 */
export function getDefaultClaudeDir(): string {
  return process.env.CCS_CLONER_CLAUDE_DIR || join(homedir(), ".claude");
}

/**
 * Read configuration from environment variables.
 *
 * Supported environment variables:
 * - CCS_CLONER_CLAUDE_DIR: Override Claude data directory
 * - CCS_CLONER_OUTPUT_FORMAT: Default output format (human | json)
 * - CCS_CLONER_VERBOSE: Enable verbose output (1 | true)
 *
 * @returns Environment-based configuration
 */
export function readEnvironmentConfiguration(): EnvironmentConfiguration {
  const config: EnvironmentConfiguration = {};

  // Claude data directory
  const claudeDir = process.env.CCS_CLONER_CLAUDE_DIR;
  if (claudeDir) {
    config.claudeDataDirectory = claudeDir;
  }

  // Output format
  const outputFormat = process.env.CCS_CLONER_OUTPUT_FORMAT;
  if (outputFormat === "json" || outputFormat === "human") {
    config.outputFormat = outputFormat;
  }

  // Verbose output
  const verbose = process.env.CCS_CLONER_VERBOSE;
  if (verbose === "1" || verbose === "true") {
    config.verboseOutput = true;
  }

  return config;
}

/**
 * Get the default configuration values.
 *
 * @returns Default resolved configuration
 */
export function getDefaultConfiguration(): ResolvedConfiguration {
  return {
    claudeDataDirectory: getDefaultClaudeDir(),
    defaultToolRemovalPercentage: 80,
    outputFormat: "human",
    verboseOutput: false,
  };
}
