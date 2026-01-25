#!/usr/bin/env bun
/**
 * ccs-cloner CLI
 *
 * Clone and modify Claude Code sessions.
 *
 * Uses citty for command-line parsing with proper subcommand support.
 */

import { runMain } from "citty";
import { mainCommand } from "./commands/main-command.js";

runMain(mainCommand);
