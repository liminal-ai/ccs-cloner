#!/usr/bin/env bun
/**
 * ccs-cloner CLI
 *
 * Clone and modify Claude Code sessions.
 *
 * Uses citty for command-line parsing with proper subcommand support.
 */

import { runMain } from "citty";
import { mainCommand, showHelp } from "./commands/main-command.js";

// Intercept --help/-h before citty to show comprehensive help
const args = process.argv.slice(2);
const isHelpOnly = args.length === 1 && (args[0] === "--help" || args[0] === "-h");
const isNoArgs = args.length === 0;

if (isHelpOnly || isNoArgs) {
  showHelp();
  process.exit(0);
}

runMain(mainCommand);
