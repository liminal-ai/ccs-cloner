/**
 * CLI Argument Normalization
 *
 * Pre-processes CLI arguments before passing to citty.
 */

/**
 * Normalize --strip-tools argument to avoid consuming the next flag as its value.
 *
 * Node.js util.parseArgs() (used by citty) doesn't support optional string arguments.
 * When --strip-tools appears without a value, it consumes the next argument.
 *
 * This transforms: --strip-tools --dsp → --strip-tools=default --dsp
 */
export function normalizeStripToolsArg(args: string[]): string[] {
	const idx = args.indexOf("--strip-tools");
	if (idx === -1) {
		return args;
	}

	// Already has = syntax: --strip-tools=aggressive
	if (args[idx].includes("=")) {
		return args;
	}

	const nextArg = args[idx + 1];
	const nextIsFlag = !nextArg || nextArg.startsWith("-");

	if (nextIsFlag) {
		// Transform: --strip-tools --dsp → --strip-tools=default --dsp
		const normalized = [...args];
		normalized[idx] = "--strip-tools=default";
		return normalized;
	}

	return args;
}
