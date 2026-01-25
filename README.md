# ccs-cloner

Clone and modify Claude Code sessions with context reduction.

## Why This Exists

Claude Code sessions accumulate context over time: tool calls with large inputs/outputs, orphaned conversation branches from rollbacks, and thinking blocks. When sessions hit context limits, continuation becomes impossible.

ccs-cloner creates a lean copy of a session by:

1. Extracting only the active conversation branch (discarding orphaned rollback branches)
2. Removing tool calls from early turns where detailed results no longer matter
3. Optionally truncating remaining tool content instead of full removal
4. Automatically removing thinking blocks when tools are modified

The cloned session appears in `claude --resume` and can be continued with reduced context.

## Installation

```bash
# Clone and build from source
git clone https://github.com/liminal-ai/ccs-cloner.git
cd ccs-cloner
bun install
bun link

# Or install from npm (when published)
# bun add -g ccs-cloner
# npm install -g ccs-cloner
```

Requires Bun 1.0+ or Node.js 20+.

## Quick Start

```bash
# List recent sessions to find the session ID
ccs-cloner list

# Clone a session with default 80% tool removal
ccs-cloner clone abc123 --strip-tools

# Clone with higher removal for very long sessions
ccs-cloner clone abc123 --strip-tools=95

# Clone and truncate (not remove) the remaining 20% of tools
ccs-cloner clone abc123 --strip-tools --truncate-remaining

# Get detailed info about a session before cloning
ccs-cloner info abc123
```

## Commands

### clone

Clone a session with optional modifications.

```bash
ccs-cloner clone <sessionId> [options]
```

**Arguments:**

- `sessionId` - Session UUID to clone (required)

**Options:**

| Flag | Description |
|------|-------------|
| `--strip-tools` | Remove tools from first 80% of turns |
| `--strip-tools=N` | Remove tools from first N% of turns (0-100) |
| `--truncate-remaining` | Truncate tool content in turns not fully stripped. Reduces tool inputs/outputs to 2 lines or 120 chars. Requires `--strip-tools` |
| `--output, -o <path>` | Output path (default: auto-generated in same project directory) |
| `--claude-dir <path>` | Claude data directory (default: `~/.claude`) |
| `--json` | Output result as JSON |
| `--verbose, -v` | Verbose output with statistics |

**Examples:**

```bash
# Default: remove tools from 80% of turns
ccs-cloner clone abc-123-def --strip-tools

# Aggressive: remove from 95% of turns
ccs-cloner clone abc-123-def --strip-tools=95

# Moderate removal + truncation of remaining tools
ccs-cloner clone abc-123-def --strip-tools=60 --truncate-remaining

# Custom output location
ccs-cloner clone abc-123-def --strip-tools -o ./backup.jsonl

# JSON output for scripting
ccs-cloner clone abc-123-def --strip-tools --json
```

### list

List Claude Code sessions.

```bash
ccs-cloner list [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--project, -p <path>` | Filter by project path (substring match) |
| `--limit, -n <count>` | Maximum sessions to show (default: 20) |
| `--claude-dir <path>` | Claude data directory (default: `~/.claude`) |
| `--json` | Output as JSON |
| `--verbose, -v` | Show additional details |

**Examples:**

```bash
# List 20 most recent sessions
ccs-cloner list

# Filter by project path
ccs-cloner list -p my-project

# Show more sessions
ccs-cloner list -n 50
```

### info

Show detailed information about a session.

```bash
ccs-cloner info <sessionId> [options]
```

**Arguments:**

- `sessionId` - Session UUID to inspect (required)

**Options:**

| Flag | Description |
|------|-------------|
| `--claude-dir <path>` | Claude data directory (default: `~/.claude`) |
| `--json` | Output as JSON |
| `--verbose, -v` | Show additional details |

**Output includes:**

- Session ID and project path
- Turn count and entry count
- File size and timestamps
- Tool call count
- Whether session contains thinking blocks

## Configuration

ccs-cloner uses [c12](https://github.com/unjs/c12) for configuration loading.

### Config File

Create `ccs-cloner.config.ts` in your project root:

```typescript
import type { UserConfiguration } from "ccs-cloner";

const config: UserConfiguration = {
  // Override Claude data directory
  claudeDataDirectory: "/custom/path/to/.claude",

  // Default percentage when --strip-tools has no value (default: 80)
  defaultToolRemovalPercentage: 80,

  // Default output format: "human" or "json"
  outputFormat: "human",

  // Enable verbose output by default
  verboseOutput: false,
};

export default config;
```

Supported config file names:

- `ccs-cloner.config.ts`
- `ccs-cloner.config.js`
- `.ccs-clonerrc`
- `.ccs-clonerrc.json`
- `.ccs-clonerrc.yaml`

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CCS_CLONER_CLAUDE_DIR` | Claude data directory |
| `CCS_CLONER_OUTPUT_FORMAT` | Output format (`human` or `json`) |
| `CCS_CLONER_VERBOSE` | Enable verbose output (`true` or `false`) |

### Precedence

Configuration sources are merged in order (later overrides earlier):

1. Defaults
2. Config file
3. Environment variables
4. CLI flags

## How It Works

### Active Branch Extraction

Claude Code sessions are stored as JSONL files with a tree structure using `uuid` and `parentUuid` fields. When you use rollback or continue from an earlier point, the old branch becomes orphaned but remains in the file.

ccs-cloner walks the `parentUuid` chain from the leaf node (identified via `summary.leafUuid` or latest timestamp) back to the root, keeping only entries in the active conversation path. Orphaned branches are discarded.

### Tool Removal Zones

Tool removal operates on "turns" (user message + assistant response pairs). With `--strip-tools=80`:

1. Calculate 80% of total turns
2. In the first 80% of turns: completely remove all `tool_use` and `tool_result` blocks
3. In the remaining 20%: tools are preserved (or truncated if `--truncate-remaining`)

The percentage calculation uses `Math.max(1, Math.floor(...))` to ensure at least one turn is affected when percentage > 0.

### Thinking Block Removal

When any tools are removed (`--strip-tools` with percentage > 0), all thinking blocks are automatically removed from the entire session. This is because thinking blocks often reference tool results that may no longer exist.

### Session Index Update

After writing the cloned session file, ccs-cloner:

1. Creates the session's todos file
2. Creates the session-env directory
3. Updates the project's `sessions-index.json`

This ensures the cloned session appears in `claude --resume`.

## SDK Usage

ccs-cloner exports its core functions for programmatic use:

```typescript
import {
  executeCloneOperation,
  listAllProjects,
  listSessionsInProject,
  findSessionFileById,
  parseSessionFile,
  extractActiveBranchFromSession,
  removeToolCallsFromHistory,
} from "ccs-cloner";

// Clone a session programmatically
const result = await executeCloneOperation({
  sourceSessionId: "abc-123-def",
  toolRemovalConfig: {
    toolRemovalPercentage: 80,
    truncateRemainingTools: true,
    thinkingRemovalPercentage: 100,
  },
});

console.log(result.clonedSessionId);
console.log(result.operationStatistics);

// List all projects
const projects = await listAllProjects();
for (const project of projects) {
  console.log(project.path, project.folder);
}

// Find and parse a session
const sessionPath = await findSessionFileById("abc-123-def");
const { entries } = await parseSessionFile(sessionPath);

// Extract active branch from entries
const activeBranch = extractActiveBranchFromSession(entries);
console.log(activeBranch.extractionStatistics.orphanedEntriesDiscarded);

// Remove tools from entries
const removalResult = removeToolCallsFromHistory(activeBranch.entriesInActiveChain, {
  toolRemovalPercentage: 80,
  truncateRemainingTools: false,
  thinkingRemovalPercentage: 100,
});
console.log(removalResult.statistics.toolCallsRemoved);
```

### Exported Functions

**Core Operations:**

- `executeCloneOperation(options)` - Full clone pipeline
- `extractActiveBranchFromSession(entries, leafUuid?)` - Extract active branch
- `removeToolCallsFromHistory(entries, options)` - Remove/truncate tools
- `filterCloneableEntries(entries)` - Filter non-cloneable entry types
- `repairBrokenParentReferences(entries)` - Fix parent chain after filtering
- `identifyTurnBoundaries(entries)` - Calculate turn boundaries
- `countTurns(entries)` - Count turns in session

**IO Operations:**

- `findSessionFileById(sessionId, claudeDir?)` - Find session file path
- `listAllProjects(claudeDir?)` - List all project directories
- `listSessionsInProject(projectPath)` - List sessions in a project
- `parseSessionFile(path)` - Parse JSONL session file
- `parseSessionContent(content)` - Parse JSONL string
- `serializeSessionEntries(entries)` - Serialize entries to JSONL
- `writeSessionFile(path, content)` - Write session file
- `addSessionToIndex(projectDir, sessionId, path, metadata)` - Update index

**Configuration:**

- `loadConfiguration(cliConfig?)` - Load merged configuration
- `getDefaultClaudeDir()` - Get default Claude directory path

### Exported Types

```typescript
import type {
  // Session types
  SessionLineItem,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,

  // Operation types
  CloneOperationOptions,
  CloneOperationResult,
  CloneOperationStatistics,
  ToolRemovalOptions,
  ToolRemovalResult,

  // Branch types
  ActiveBranchChain,
  UuidGraph,

  // Configuration
  UserConfiguration,
  ResolvedConfiguration,
} from "ccs-cloner";
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format

# Build
bun run build
```

### Project Structure

```
src/
  cli.ts                 # CLI entry point
  index.ts               # SDK exports
  commands/              # CLI command definitions
  core/                  # Core logic (extraction, removal, etc.)
  io/                    # File system operations
  config/                # Configuration loading
  output/                # Output formatting
  types/                 # TypeScript type definitions
  errors/                # Custom error classes
```

## License

MIT
