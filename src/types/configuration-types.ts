/**
 * Type definitions for configuration.
 */

/**
 * User configuration that can be set via config file.
 */
export interface UserConfiguration {
  /** Claude data directory (default: ~/.claude) */
  claudeDataDirectory?: string;
  /** Default percentage of tools to remove (default: 80) */
  defaultToolRemovalPercentage?: number;
  /** Output format: human-readable or JSON */
  outputFormat?: "human" | "json";
  /** Enable verbose output */
  verboseOutput?: boolean;
}

/**
 * Environment variable configuration keys.
 */
export interface EnvironmentConfiguration {
  /** CCS_CLONER_CLAUDE_DIR - Override Claude data directory */
  claudeDataDirectory?: string;
  /** CCS_CLONER_OUTPUT_FORMAT - Default output format */
  outputFormat?: "human" | "json";
  /** CCS_CLONER_VERBOSE - Enable verbose output */
  verboseOutput?: boolean;
}

/**
 * CLI argument configuration.
 */
export interface CliConfiguration {
  /** --claude-dir flag */
  claudeDataDirectory?: string;
  /** --json flag */
  outputFormat?: "human" | "json";
  /** --verbose flag */
  verboseOutput?: boolean;
}

/**
 * Fully resolved configuration with all sources merged.
 *
 * Precedence: CLI > Environment > Config file > Defaults
 */
export interface ResolvedConfiguration {
  /** Claude data directory */
  claudeDataDirectory: string;
  /** Default percentage of tools to remove */
  defaultToolRemovalPercentage: number;
  /** Output format */
  outputFormat: "human" | "json";
  /** Verbose output enabled */
  verboseOutput: boolean;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIGURATION: ResolvedConfiguration = {
  claudeDataDirectory: "", // Will be resolved to ~/.claude at runtime
  defaultToolRemovalPercentage: 80,
  outputFormat: "human",
  verboseOutput: false,
};
