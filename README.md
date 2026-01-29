# ccs-cloner

Clone and modify Claude Code sessions with context reduction.

## Why This Exists

Claude Code sessions accumulate context over time: tool calls with large inputs/outputs, orphaned conversation branches from rollbacks, and thinking blocks. When sessions hit context limits, continuation becomes impossible.

ccs-cloner creates a lean copy of a session by:

1. Extracting only the active conversation branch (discarding orphaned rollback branches)
2. Removing tool calls from old turns while preserving recent ones
3. Truncating tool content in intermediate turns for gradual context reduction
4. Automatically removing thinking blocks when tools are modified

The cloned session appears in `claude --resume` and can be continued with reduced context.

## Installation

```bash
# Install globally via npm
npm install -g ccs-cloner

# Or via bun
bun add -g ccs-cloner

# Or build from source
git clone https://github.com/liminal-ai/ccs-cloner.git
cd ccs-cloner
bun install && bun link
```

Requires Bun 1.0+ or Node.js 20+.

## Quick Start

```bash
# List recent sessions to find the session ID
ccs-cloner list

# Clone with default preset (keep 20 tool-turns)
ccs-cloner clone abc123 --strip-tools

# Clone with aggressive preset (keep 10 tool-turns)
ccs-cloner clone abc123 --strip-tools=aggressive

# Clone with extreme preset (remove all tools)
ccs-cloner clone abc123 --strip-tools=extreme

# Get detailed info about a session before cloning
ccs-cloner info abc123
```

## Presets

Tool removal uses presets that define how many "turns with tools" to keep and how many of those to truncate.

| Preset | Keep | Truncate | Behavior |
|--------|------|----------|----------|
| `default` | 20 turns | 50% | 10 truncated, 10 full fidelity |
| `aggressive` | 10 turns | 50% | 5 truncated, 5 full fidelity |
| `extreme` | 0 | - | All tools removed |

### How Presets Work

Tool removal targets **turns that have tool calls**, not all turns. This ensures consistent behavior across multiple clones of the same session.

Of the kept turns:
- **Oldest portion** (truncate %) -> tool content reduced to ~2 lines
- **Newest portion** -> full fidelity preserved

This provides graceful degradation: recent tool context is preserved exactly, older tool context is summarized, and ancient tool context is removed entirely.

### Custom Presets

Define in `ccs-cloner.config.ts`:

```typescript
export default {
  customPresets: {
    minimal: { name: "minimal", keepTurnsWithTools: 5, truncatePercent: 80 },
    thorough: { name: "thorough", keepTurnsWithTools: 30, truncatePercent: 30 },
  },
  defaultPreset: "minimal",  // Use custom preset as default
};
```

Use with: `ccs-cloner clone abc123 --strip-tools=minimal`

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
| `--strip-tools` | Remove tools using default preset |
| `--strip-tools=<preset>` | Remove tools using named preset (default, aggressive, extreme, or custom) |
| `--output, -o <path>` | Output path (default: auto-generated in same project directory) |
| `--claude-dir <path>` | Claude data directory (default: `~/.claude`) |
| `--json` | Output result as JSON |
| `--verbose, -v` | Verbose output with statistics |

**Examples:**

```bash
# Default preset: keep 20 tool-turns
ccs-cloner clone abc-123-def --strip-tools

# Aggressive: keep only 10 tool-turns
ccs-cloner clone abc-123-def --strip-tools=aggressive

# Extreme: remove all tools
ccs-cloner clone abc-123-def --strip-tools=extreme

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

  // Default preset when --strip-tools has no value
  defaultPreset: "default",

  // Custom presets
  customPresets: {
    minimal: { name: "minimal", keepTurnsWithTools: 5, truncatePercent: 80 },
  },

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

### Tool Removal Algorithm

Tool removal uses a "keep last N turns-with-tools" model:

1. **Identify**: Find all turns that contain tool calls
2. **Keep**: Preserve the last N of those turns
3. **Truncate**: Of kept turns, truncate the oldest X%
4. **Remove**: Remove tools from everything else

This ensures consistent behavior across multiple clones. Unlike percentage-based removal, this algorithm doesn't degrade over repeated clones.

### Thinking Block Removal

When `--strip-tools` is used on a session containing tools, all thinking blocks are automatically removed from the entire session. This is because thinking blocks often reference tool results that may no longer exist.

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
  BUILT_IN_PRESETS,
  resolveToolRemovalOptions,
} from "ccs-cloner";

// Clone a session with default preset
const result = await executeCloneOperation({
  sourceSessionId: "abc-123-def",
  toolRemovalConfig: {
    preset: "default",
  },
});

console.log(result.clonedSessionId);
console.log(result.operationStatistics);

// Clone with aggressive preset
const aggressiveResult = await executeCloneOperation({
  sourceSessionId: "abc-123-def",
  toolRemovalConfig: {
    preset: "aggressive",
  },
});

// Clone with custom values (override preset)
const customResult = await executeCloneOperation({
  sourceSessionId: "abc-123-def",
  toolRemovalConfig: {
    preset: "default",
    keepTurnsWithTools: 15,  // override preset value
    truncatePercent: 75,      // override preset value
  },
});

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

// Remove tools from entries directly
const resolved = resolveToolRemovalOptions({ preset: "default" });
const removalResult = removeToolCallsFromHistory(activeBranch.entriesInActiveChain, resolved);
console.log(removalResult.statistics.turnsWithToolsRemoved);
console.log(removalResult.statistics.turnsWithToolsTruncated);
console.log(removalResult.statistics.turnsWithToolsPreserved);
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

**Preset System:**

- `BUILT_IN_PRESETS` - Built-in preset definitions
- `resolvePreset(name, customPresets?)` - Resolve preset by name
- `resolveToolRemovalOptions(options, customPresets?)` - Resolve to concrete values
- `isValidPresetName(name, customPresets?)` - Check if preset exists
- `listAvailablePresets(customPresets?)` - List all preset names

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
  ToolRemovalStatistics,
  ToolRemovalPreset,
  ResolvedToolRemovalOptions,

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
  config/                # Configuration and presets
  core/                  # Core logic (extraction, removal, etc.)
  io/                    # File system operations
  output/                # Output formatting
  types/                 # TypeScript type definitions
  errors/                # Custom error classes
```

## License

MIT
