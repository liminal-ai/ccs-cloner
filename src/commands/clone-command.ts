/**
 * Clone Command
 *
 * Clone a Claude Code session with optional tool/thinking removal.
 */

import { defineCommand } from "citty";
import { executeCloneOperation } from "../core/clone-operation-executor.js";
import { loadConfiguration } from "../config/configuration-loader.js";
import { formatCloneResult, formatError } from "../output/clone-result-formatter.js";
import { ArgumentValidationError } from "../errors/clone-operation-errors.js";
import { isValidPresetName, listAvailablePresets } from "../config/tool-removal-presets.js";
import type { CloneOperationOptions, ToolRemovalOptions } from "../types/index.js";

export const cloneCommand = defineCommand({
  meta: {
    name: "clone",
    description: "Clone session with tool/thinking removal for context reduction",
  },

  args: {
    sessionId: {
      type: "positional",
      description: "Session ID (UUID) to clone",
      required: true,
    },
    "strip-tools": {
      type: "string",
      description:
        "Remove tools using preset (default|aggressive|extreme). Use --strip-tools for default preset.",
    },
    output: {
      type: "string",
      alias: "o",
      description: "Output path (default: auto in same project)",
    },
    "claude-dir": {
      type: "string",
      description: "Claude data directory (default: ~/.claude)",
    },
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
    verbose: {
      type: "boolean",
      alias: "v",
      description: "Verbose output",
      default: false,
    },
  },

  async run({ args }) {
    try {
      // Load configuration with CLI overrides
      const config = await loadConfiguration({
        claudeDataDirectory: args["claude-dir"],
        outputFormat: args.json ? "json" : "human",
        verboseOutput: args.verbose,
      });

      // Parse --strip-tools value
      let toolRemovalConfig: ToolRemovalOptions | undefined;
      const stripToolsArg = args["strip-tools"];

      if (stripToolsArg !== undefined) {
        let presetName: string;

        if (stripToolsArg === "" || stripToolsArg === "true") {
          // --strip-tools without value -> use default preset from config
          presetName = config.defaultPreset;
        } else if (isValidPresetName(stripToolsArg, config.customPresets)) {
          // --strip-tools=aggressive -> use named preset
          presetName = stripToolsArg;
        } else {
          // Unknown preset name
          const available = listAvailablePresets(config.customPresets);
          throw new ArgumentValidationError(
            "--strip-tools",
            `Unknown preset: ${stripToolsArg}. Available: ${available.join(", ")}`
          );
        }

        toolRemovalConfig = { preset: presetName };
      }

      // Build clone options
      const options: CloneOperationOptions = {
        sourceSessionId: args.sessionId,
        toolRemovalConfig,
        customPresets: config.customPresets,
        outputPathOverride: args.output,
        claudeDataDirectory: config.claudeDataDirectory,
      };

      // Execute clone
      const result = await executeCloneOperation(options);

      // Output result
      const output = formatCloneResult(result, {
        json: args.json,
        verbose: args.verbose,
      });
      console.log(output);

      process.exit(result.operationSucceeded ? 0 : 1);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const output = formatError(error, {
        json: args.json,
        debug: args.verbose,
      });
      console.error(output);
      process.exit(1);
    }
  },
});
