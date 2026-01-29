/**
 * ccs-cloner SDK
 *
 * Programmatic interface for cloning and analyzing Claude Code sessions.
 *
 * @example
 * ```typescript
 * import { executeCloneOperation, listAllProjects, findSessionFileById } from 'ccs-cloner';
 *
 * // Clone a session with default preset (keep 20 tool-turns)
 * const result = await executeCloneOperation({
 *   sourceSessionId: 'abc-123',
 *   toolRemovalConfig: {
 *     preset: 'default',
 *   },
 * });
 * console.log(result.clonedSessionId);
 *
 * // List all projects
 * const projects = await listAllProjects();
 *
 * // Find a session file
 * const sessionPath = await findSessionFileById('abc-123');
 * ```
 */

// Configuration
export { loadConfiguration } from "./config/configuration-loader.js";
export { getDefaultClaudeDir } from "./config/default-configuration.js";
// Preset system
export {
	BUILT_IN_PRESETS,
	isValidPresetName,
	listAvailablePresets,
	resolvePreset,
	resolveToolRemovalOptions,
} from "./config/tool-removal-presets.js";
// Core operations
export { executeCloneOperation } from "./core/clone-operation-executor.js";
export { repairBrokenParentReferences } from "./core/parent-chain-repairer.js";
// extractActiveBranchFromSession disabled - being evaluated for fixing or removal
export { filterCloneableEntries } from "./core/session-line-item-filter.js";
export { removeToolCallsFromHistory } from "./core/tool-call-remover.js";
export {
	countTurns,
	identifyTurnBoundaries,
} from "./core/turn-boundary-calculator.js";
// Errors
export {
	ActiveBranchExtractionError,
	ArgumentValidationError,
	CcsError,
	ConfigurationError,
	FileOperationError,
	InvalidSessionError,
	SessionNotFoundError,
} from "./errors/clone-operation-errors.js";
// IO operations
export {
	decodeProjectPath,
	encodeProjectPath,
	findSessionFileById,
	getProjectDirFromPath,
	listAllProjects,
	listSessionsInProject,
} from "./io/session-directory-scanner.js";
export {
	countToolCalls,
	extractFirstUserMessage,
	hasThinkingBlocks,
	parseSessionContent,
	parseSessionFile,
	serializeSessionEntries,
} from "./io/session-file-reader.js";
export {
	createSessionEnvDirectory,
	createTodosFile,
	writeSessionFile,
} from "./io/session-file-writer.js";
export {
	addSessionToIndex,
	readSessionsIndex,
	removeSessionFromIndex,
} from "./io/session-index-updater.js";

// Types
export type {
	// Clone operation types
	CloneOperationOptions,
	CloneOperationResult,
	CloneOperationStatistics,
	ContentBlock,
	ConversationMessage,
	FilteredEntriesResult,
	// Configuration types
	ResolvedConfiguration,
	ResolvedToolRemovalOptions,
	SessionDetails,
	SessionIndexEntry,
	SessionInfo,
	// Session types
	SessionLineItem,
	SessionsIndex,
	TextBlock,
	ThinkingBlock,
	ToolRemovalOptions,
	ToolRemovalPreset,
	ToolRemovalResult,
	ToolRemovalStatistics,
	ToolResultBlock,
	ToolUseBlock,
	// Tool removal types
	TurnBoundary,
	UserConfiguration,
} from "./types/index.js";
