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
import type { CloneOperationOptions, ToolRemovalOptions } from "../types/index.js";

export const cloneCommand = defineCommand({
  meta: {
    name: "clone",
    description: "Clone a session with optional modifications",
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
        "Remove tools from first N% of turns (default: 80). Use --strip-tools or --strip-tools=N",
    },
    "truncate-remaining": {
      type: "boolean",
      description: "Truncate tools that weren't removed",
      default: false,
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

      // Check validation: --truncate-remaining requires --strip-tools
      if (args["truncate-remaining"] && stripToolsArg === undefined) {
        throw new ArgumentValidationError(
          "--truncate-remaining",
          "--truncate-remaining requires --strip-tools"
        );
      }

      if (stripToolsArg !== undefined) {
        // Parse the strip-tools value
        let percentage = config.defaultToolRemovalPercentage;

        if (stripToolsArg === "" || stripToolsArg === "true") {
          // --strip-tools without value: use default (80)
          percentage = config.defaultToolRemovalPercentage;
        } else {
          // --strip-tools=N: parse the number
          const parsed = parseInt(stripToolsArg, 10);
          if (isNaN(parsed) || parsed < 0 || parsed > 100) {
            throw new ArgumentValidationError(
              "--strip-tools",
              "Must be a number between 0 and 100"
            );
          }
          percentage = parsed;
        }

        toolRemovalConfig = {
          toolRemovalPercentage: percentage,
          truncateRemainingTools: args["truncate-remaining"] ?? false,
          // Always remove all thinking when tools are touched
          thinkingRemovalPercentage: percentage > 0 ? 100 : 0,
        };
      }

      // Build clone options
      const options: CloneOperationOptions = {
        sourceSessionId: args.sessionId,
        toolRemovalConfig,
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
