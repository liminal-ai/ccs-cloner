/**
 * Configuration Loader
 *
 * Loads configuration using c12 with proper precedence:
 * CLI > Environment > Config file > Defaults
 */

import { loadConfig } from "c12";
import type {
  ResolvedConfiguration,
  UserConfiguration,
  CliConfiguration,
  ToolRemovalPreset,
} from "../types/index.js";
import { getDefaultConfiguration, readEnvironmentConfiguration } from "./default-configuration.js";
import { safeValidateConfiguration } from "./configuration-schema.js";
import { isValidPresetName } from "./tool-removal-presets.js";

/**
 * Result from c12 config loading.
 */
interface C12ConfigResult {
  config: UserConfiguration;
}

/**
 * Load configuration from c12.
 *
 * Searches for:
 * - ccs-cloner.config.ts
 * - ccs-cloner.config.js
 * - .ccs-clonerrc
 * - .ccs-clonerrc.json
 * - .ccs-clonerrc.yaml
 *
 * @returns User configuration from config file or empty object
 */
async function loadConfigFile(): Promise<UserConfiguration> {
  try {
    const result = (await loadConfig({
      name: "ccs-cloner",
      defaults: {},
    })) as C12ConfigResult;

    // Validate the loaded config
    const validated = safeValidateConfiguration(result.config);
    return validated || {};
  } catch {
    // Config file not found or invalid - use defaults
    return {};
  }
}

/**
 * Load and merge configuration from all sources.
 *
 * Precedence (highest to lowest):
 * 1. CLI arguments
 * 2. Environment variables
 * 3. Config file (c12)
 * 4. Defaults
 *
 * @param cliConfig - Configuration from CLI arguments (optional)
 * @returns Fully resolved configuration
 */
export async function loadConfiguration(
  cliConfig?: CliConfiguration
): Promise<ResolvedConfiguration> {
  // Start with defaults
  const defaults = getDefaultConfiguration();

  // Load config file
  const fileConfig = await loadConfigFile();

  // Load environment config
  const envConfig = readEnvironmentConfiguration();

  // Merge custom presets (only from config file, not env/cli)
  const customPresets: Record<string, ToolRemovalPreset> = {
    ...defaults.customPresets,
    ...fileConfig.customPresets,
  };

  // Validate defaultPreset if specified in config file
  if (fileConfig.defaultPreset && !isValidPresetName(fileConfig.defaultPreset, customPresets)) {
    throw new Error(
      `Invalid defaultPreset "${fileConfig.defaultPreset}" in configuration. ` +
        `Preset must be a built-in preset (default, aggressive, extreme) or defined in customPresets.`
    );
  }

  // Merge in order of precedence (later overrides earlier)
  const merged: ResolvedConfiguration = {
    ...defaults,
    customPresets,
    ...(fileConfig.claudeDataDirectory && {
      claudeDataDirectory: fileConfig.claudeDataDirectory,
    }),
    ...(fileConfig.defaultPreset && {
      defaultPreset: fileConfig.defaultPreset,
    }),
    ...(fileConfig.outputFormat && { outputFormat: fileConfig.outputFormat }),
    ...(fileConfig.verboseOutput !== undefined && {
      verboseOutput: fileConfig.verboseOutput,
    }),
    // Environment overrides config file
    ...(envConfig.claudeDataDirectory && {
      claudeDataDirectory: envConfig.claudeDataDirectory,
    }),
    ...(envConfig.outputFormat && { outputFormat: envConfig.outputFormat }),
    ...(envConfig.verboseOutput !== undefined && {
      verboseOutput: envConfig.verboseOutput,
    }),
    // CLI overrides everything
    ...(cliConfig?.claudeDataDirectory && {
      claudeDataDirectory: cliConfig.claudeDataDirectory,
    }),
    ...(cliConfig?.outputFormat && { outputFormat: cliConfig.outputFormat }),
    ...(cliConfig?.verboseOutput !== undefined && {
      verboseOutput: cliConfig.verboseOutput,
    }),
  };

  return merged;
}

/**
 * Load configuration synchronously (without c12 file loading).
 *
 * Uses only environment variables and defaults.
 * Useful for simple cases where async loading isn't needed.
 *
 * @param cliConfig - Configuration from CLI arguments (optional)
 * @returns Resolved configuration
 */
export function loadConfigurationSync(cliConfig?: CliConfiguration): ResolvedConfiguration {
  const defaults = getDefaultConfiguration();
  const envConfig = readEnvironmentConfiguration();

  return {
    ...defaults,
    ...(envConfig.claudeDataDirectory && {
      claudeDataDirectory: envConfig.claudeDataDirectory,
    }),
    ...(envConfig.outputFormat && { outputFormat: envConfig.outputFormat }),
    ...(envConfig.verboseOutput !== undefined && {
      verboseOutput: envConfig.verboseOutput,
    }),
    ...(cliConfig?.claudeDataDirectory && {
      claudeDataDirectory: cliConfig.claudeDataDirectory,
    }),
    ...(cliConfig?.outputFormat && { outputFormat: cliConfig.outputFormat }),
    ...(cliConfig?.verboseOutput !== undefined && {
      verboseOutput: cliConfig.verboseOutput,
    }),
  };
}
