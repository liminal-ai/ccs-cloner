/**
 * Main Command
 *
 * Root citty command with subcommands.
 */

import { defineCommand } from "citty";
import { cloneCommand } from "./clone-command.js";
import { listCommand } from "./list-command.js";
import { infoCommand } from "./info-command.js";

const VERSION = "0.2.0";

export const mainCommand = defineCommand({
  meta: {
    name: "ccs-cloner",
    version: VERSION,
    description: "Clone and modify Claude Code sessions",
  },

  args: {
    version: {
      type: "boolean",
      description: "Show version",
    },
  },

  subCommands: {
    clone: cloneCommand,
    list: listCommand,
    info: infoCommand,
  },

  async run({ args }) {
    if (args.version) {
      console.log(`ccs-cloner v${VERSION}`);
      process.exit(0);
    }

    // Show help by default (citty handles this)
    console.log(`ccs-cloner v${VERSION} - Clone and modify Claude Code sessions

Usage: ccs-cloner <command> [options]

Commands:
  clone    Clone a session with optional modifications
  list     List sessions
  info     Show session details

Global Options:
  --help, -h     Show help
  --version      Show version

Examples:
  # Clone a session with 80% tool removal (default)
  ccs-cloner clone abc123 --strip-tools

  # Clone with custom tool removal percentage
  ccs-cloner clone abc123 --strip-tools=95

  # Clone and truncate remaining tools
  ccs-cloner clone abc123 --strip-tools --truncate-remaining

  # List recent sessions
  ccs-cloner list

  # Show session info
  ccs-cloner info abc123

Run "ccs-cloner <command> --help" for command-specific help.`);

    process.exit(0);
  },
});
