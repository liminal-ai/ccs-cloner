/**
 * ccs-cloner SDK
 *
 * Programmatic interface for cloning and analyzing Claude Code sessions.
 *
 * @example
 * ```typescript
 * import { executeCloneOperation, listAllProjects, findSessionFileById } from 'ccs-cloner';
 *
 * // Clone a session with 80% tool removal
 * const result = await executeCloneOperation({
 *   sourceSessionId: 'abc-123',
 *   toolRemovalConfig: {
 *     toolRemovalPercentage: 80,
 *     truncateRemainingTools: true,
 *     thinkingRemovalPercentage: 100,
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

// Core operations
export { executeCloneOperation } from "./core/clone-operation-executor.js";
export { extractActiveBranchFromSession } from "./core/active-branch-extractor.js";
export { filterCloneableEntries } from "./core/session-line-item-filter.js";
export { removeToolCallsFromHistory } from "./core/tool-call-remover.js";
export { repairBrokenParentReferences } from "./core/parent-chain-repairer.js";
export { identifyTurnBoundaries, countTurns } from "./core/turn-boundary-calculator.js";

// IO operations
export {
  findSessionFileById,
  listAllProjects,
  listSessionsInProject,
  getProjectDirFromPath,
  decodeProjectPath,
  encodeProjectPath,
} from "./io/session-directory-scanner.js";

export {
  parseSessionFile,
  parseSessionContent,
  serializeSessionEntries,
  extractFirstUserMessage,
  countToolCalls,
  hasThinkingBlocks,
} from "./io/session-file-reader.js";

export {
  writeSessionFile,
  createTodosFile,
  createSessionEnvDirectory,
} from "./io/session-file-writer.js";

export {
  addSessionToIndex,
  readSessionsIndex,
  removeSessionFromIndex,
} from "./io/session-index-updater.js";

// Configuration
export { loadConfiguration } from "./config/configuration-loader.js";
export { getDefaultClaudeDir } from "./config/default-configuration.js";

// Errors
export {
  CcsError,
  SessionNotFoundError,
  InvalidSessionError,
  ConfigurationError,
  ArgumentValidationError,
  ActiveBranchExtractionError,
  FileOperationError,
} from "./errors/clone-operation-errors.js";

// Types
export type {
  // Session types
  SessionLineItem,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  ConversationMessage,
  SessionIndexEntry,
  SessionsIndex,

  // Active branch types
  ActiveBranchChain,
  UuidGraphNode,
  UuidGraph,

  // Tool removal types
  TurnBoundary,
  ToolRemovalOptions,
  ResolvedToolRemovalOptions,
  ToolRemovalResult,
  ToolRemovalStatistics,

  // Clone operation types
  CloneOperationOptions,
  CloneOperationResult,
  CloneOperationStatistics,
  FilteredEntriesResult,
  SessionInfo,
  SessionDetails,

  // Configuration types
  ResolvedConfiguration,
  UserConfiguration,
} from "./types/index.js";
