/**
 * Main Command
 *
 * Root citty command with subcommands.
 */

import { defineCommand } from "citty";
import { cloneCommand } from "./clone-command.js";
import { infoCommand } from "./info-command.js";
import { listCommand } from "./list-command.js";

const VERSION = "0.3.6";

export function showHelp(): void {
	console.log(`ccs-cloner v${VERSION} - Clone Claude Code sessions with reduced context

TIP: Configure Claude Code to show session ID in status line for easy access.

USAGE
  ccs-cloner <command> [options]

COMMANDS
  clone <id>   Clone session with modifications
  list         List sessions
  info <id>    Show session details

PRESETS (for --strip-tools)
  default      Keep 20 tool-turns: 10 truncated, 10 full fidelity
  aggressive   Keep 10 tool-turns: 5 truncated, 5 full fidelity
  extreme      Remove all tools

HOW IT WORKS
  Tool removal targets "turns with tools" (not all turns).
  Of kept turns, oldest portion is truncated, newest is full fidelity.
  This ensures consistent behavior across multiple clones.

CUSTOM PRESETS
  Define in ccs-cloner.config.ts:
    customPresets: {
      minimal: { name: "minimal", keepTurnsWithTools: 5, truncatePercent: 80 }
    }

OUTPUT OPTIONS
  --json       JSON output (for agents)
  --dsp        Include --dangerously-skip-permissions in resume command

GLOBAL OPTIONS
  --help, -h       Show help
  --quickstart     Show minimal quickstart guide
  --version        Show version

ENVIRONMENT
  CCS_CLONER_CLAUDE_DIR      Claude data directory (default: ~/.claude)
  CCS_CLONER_OUTPUT_FORMAT   "human" or "json"
  CCS_CLONER_VERBOSE         true/false

Run "ccs-cloner <command> --help" for command-specific options.`);
}

export const mainCommand = defineCommand({
	meta: {
		name: "ccs-cloner",
		version: VERSION,
		description:
			"Clone Claude Code sessions with reduced context for continuation",
	},

	args: {
		help: {
			type: "boolean",
			alias: "h",
			description: "Show help",
		},
		version: {
			type: "boolean",
			description: "Show version",
		},
		quickstart: {
			type: "boolean",
			alias: "qs",
			description: "Show quickstart guide",
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

		if (args.help) {
			// Comprehensive help (intercept before citty's default)
			showHelp();
			process.exit(0);
		}

		if (args.quickstart) {
			// Minimal, high-signal quickstart for agents (~250 tokens)
			console.log(`ccs-cloner v${VERSION} - Clone Claude Code sessions with reduced context

TIP: Configure Claude Code to show session ID in status line for easy access.

WHEN TO USE
  Session hitting context limits? Clone it with tools stripped.
  NOTE: If cloning the *current* session from within itself, the last response may be missing—run after the turn completes or from a different session.

PRESETS
  --strip-tools            default: keep 20 tool-turns (10 truncated, 10 full)
  --strip-tools=aggressive keep 10 tool-turns (5 truncated, 5 full)
  --strip-tools=extreme    remove all tools

COMMANDS
  ccs-cloner list                          # Find session IDs
  ccs-cloner info <id>                     # Check size before cloning
  ccs-cloner clone <id> --strip-tools      # Clone with default preset
  ccs-cloner clone <id> --strip-tools --dsp  # Include --dangerously-skip-permissions in resume

WHAT HAPPENS
  - Removes/truncates tool calls based on preset
  - Removes thinking blocks
  - Registers new session in Claude Code

Run "ccs-cloner --help" for full options and custom presets.`);
			process.exit(0);
		}

		// Default: show comprehensive help
		showHelp();
		process.exit(0);
	},
});
