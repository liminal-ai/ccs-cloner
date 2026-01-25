# CCS-Cloner Implementation Plan

## Overview

Build `ccs-cloner` - a CLI tool to clone and modify Claude Code sessions. First tool in the agent-cli-tools suite, establishing patterns for future CLIs.

## Goals

1. Clone Claude Code sessions with tool/thinking removal
2. Fix the "stale context" issue by properly updating all session state
3. Establish CLI + SDK dual-interface pattern
4. Implement progressive help system (-qs, -h, --help-all)

---

## Phase 1: Project Scaffold

### 1.1 Initialize Bun + TypeScript project

```
ccs-cloner/
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts              # Entry: #!/usr/bin/env bun
│   ├── index.ts            # SDK exports
│   ├── commands/
│   │   ├── index.ts
│   │   ├── clone.ts
│   │   ├── list.ts
│   │   └── info.ts
│   └── lib/
│       ├── command-def.ts  # defineCommand() framework
│       ├── cli-runner.ts   # Arg parsing, dispatch
│       ├── help.ts         # Progressive help generator
│       ├── output.ts       # Human/JSON formatting
│       ├── session-finder.ts
│       ├── session-parser.ts
│       ├── session-clone.ts
│       └── types.ts
└── test/
    └── fixtures/
```

### 1.2 Dependencies

- `zod` - schema validation (already used in source)
- No other runtime deps needed (Bun has built-in fs, path, crypto)

---

## Phase 2: Port Core Logic

### 2.1 From `/Users/leemoore/code/coding-agent-manager/src/`

| Source File | Target | Key Functions |
|-------------|--------|---------------|
| `services/session-clone.ts` | `lib/session-clone.ts` | `parseSession`, `identifyTurns`, `applyRemovals`, `repairParentUuidChain`, `truncateToolContent` |
| `services/session-clone.ts` | `lib/session-finder.ts` | `findSessionFile` (adapt for CLI, add `--claude-dir` support) |
| `types.ts` | `lib/types.ts` | `SessionEntry`, `ContentBlock`, `Turn`, `RemovalOptions` |
| `schemas/clone-v2.ts` | `lib/types.ts` | Adapt Zod schemas for CLI args |

### 2.2 Modifications to Ported Code

1. Remove Express/HTTP dependencies
2. Add `claudeDir` parameter (default `~/.claude`, env `CCS_CLONER_CLAUDE_DIR`)
3. Return results instead of writing responses

---

## Phase 3: Fix Session State Issues

**Critical additions not in current cloner:**

### 3.0 Tool Removal & Truncation Model

**Simplified approach:**

- `--strip-tools[=N]` - Remove N% of tool calls (default: 80)
- `--truncate-remaining` - Truncate tools that weren't removed

**Logic:**
```typescript
interface CloneOptions {
  stripTools?: number;       // 0-100, default 80 when flag present
  truncateRemaining?: boolean;
}

function applyToolHandling(entries: SessionEntry[], options: CloneOptions) {
  const removalPercent = options.stripTools ?? 0;

  // 1. Remove tools from first N% of turns
  let result = removeToolsFromTurns(entries, removalPercent);

  // 2. Truncate remaining tools if requested
  if (options.truncateRemaining && removalPercent < 100) {
    result = truncateRemainingTools(result, removalPercent);
  }

  return result;
}
```

**Thinking removal is automatic:**
- ANY use of `--strip-tools` (even `=0`) → remove ALL thinking blocks
- This is required because API validates thinking alignment with context
- No separate `--strip-thinking` flag needed

### 3.1 Fix `leafUuid` in Summary Entries

After removing entries, ensure summary's `leafUuid` points to a valid UUID:

```typescript
function fixLeafUuid(entries: SessionEntry[]): SessionEntry[] {
  // Find last entry with a uuid
  const lastWithUuid = [...entries].reverse().find(e => e.uuid);
  if (!lastWithUuid) return entries;

  // Update all summary entries to point to valid leaf
  return entries.map(e => {
    if (e.type === 'summary') {
      return { ...e, leafUuid: lastWithUuid.uuid };
    }
    return e;
  });
}
```

### 3.2 Create External Session Files

After writing cloned JSONL, create:

```typescript
async function createSessionSidecars(newSessionId: string, claudeDir: string) {
  // 1. Empty todos file
  const todosPath = path.join(claudeDir, 'todos', `${newSessionId}-agent-${newSessionId}.json`);
  await writeFile(todosPath, '[]');

  // 2. Empty session-env directory
  const sessionEnvPath = path.join(claudeDir, 'session-env', newSessionId);
  await mkdir(sessionEnvPath, { recursive: true });
}
```

### 3.3 Update sessions-index.json

Add entry for new session in project's index. **With safeguards:**

```typescript
async function updateSessionsIndex(
  projectDir: string,
  newSessionId: string,
  outputPath: string,
  firstPrompt: string,
  messageCount: number
) {
  const indexPath = path.join(projectDir, 'sessions-index.json');
  const backupPath = indexPath + '.bak';
  let index = { version: 1, entries: [] };

  try {
    const content = await readFile(indexPath, 'utf-8');
    index = JSON.parse(content);
    // Backup existing index before modifying
    await writeFile(backupPath, content);
  } catch { /* index doesn't exist yet, no backup needed */ }

  const stat = await fs.stat(outputPath);

  index.entries.push({
    sessionId: newSessionId,
    fullPath: outputPath,
    fileMtime: stat.mtimeMs,
    firstPrompt: firstPrompt.slice(0, 100),
    summary: `Clone: ${firstPrompt.slice(0, 50)}...`,
    messageCount,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    projectPath: decodeProjectPath(path.basename(projectDir)),
    isSidechain: false
  });

  // Validate before write
  const newContent = JSON.stringify(index, null, 2);
  JSON.parse(newContent); // Throws if invalid

  // Atomic write: write to temp, then rename
  const tempPath = indexPath + '.tmp';
  await writeFile(tempPath, newContent);
  await rename(tempPath, indexPath);
}
```

### 3.4 Filter Unwanted Entries

Remove entries that shouldn't be cloned:

```typescript
function filterCloneableEntries(entries: SessionEntry[]): SessionEntry[] {
  return entries.filter(e => {
    // Remove API error messages
    if (e.isApiErrorMessage) return false;
    // Remove synthetic messages
    if (e.message?.model === '<synthetic>') return false;
    // Remove old summary entries (we create a fresh one)
    if (e.type === 'summary') return false;
    // Remove file-history-snapshot entries (references external backup files)
    if (e.type === 'file-history-snapshot') return false;
    // Keep everything else
    return true;
  });
}
```

**Rationale:**
- **Synthetic/error entries**: Transient state markers that shouldn't persist
- **Old summaries**: We prepend a fresh summary with valid leafUuid
- **file-history-snapshot**: References backup files in `~/.claude/file-history/<sessionId>/` that won't exist for the clone; cloned sessions don't need undo history from original

---

## Phase 4: CLI Interface

### 4.1 Commands

**clone** (primary)
```
ccs-cloner clone <session-id> [options]

Options:
  --strip-tools[=N]      Remove tool calls from first N% of turns (default: 80)
  --truncate-remaining   Truncate tools that weren't removed
  -o, --output <path>    Output path (default: auto in same project)
  --claude-dir <path>    Claude data dir (default: ~/.claude)

Note: Using --strip-tools (any value) automatically removes ALL thinking blocks.
      This is required because the API validates thinking alignment with context.
```

**Usage examples:**
```bash
# Remove 80% of tools (default), keep 20% intact
ccs-cloner clone abc123 --strip-tools

# Remove 95% of tools (for heavily-cloned sessions)
ccs-cloner clone abc123 --strip-tools=95

# Remove 80%, truncate the remaining 20%
ccs-cloner clone abc123 --strip-tools --truncate-remaining

# Truncate-only mode (remove 0%, truncate all)
ccs-cloner clone abc123 --strip-tools=0 --truncate-remaining

# Remove 100% of tools
ccs-cloner clone abc123 --strip-tools=100

# Pure copy (no modifications, thinking preserved)
ccs-cloner clone abc123
```

**list**
```
ccs-cloner list [options]

Options:
  --project <path>       Filter by project path
  --limit <n>            Max sessions to show (default: 20)
  --json                 Output as JSON
```

**info**
```
ccs-cloner info <session-id>

Shows: turn count, token estimates, file size, project, timestamps
```

### 4.2 Progressive Help

```
-qs, --quickstart    3-line quick start
-h, --help           Grouped command overview
--help-all           Full documentation
<cmd> -h             Command-specific help
```

### 4.3 Output Modes

```
(default)    Human-readable with status indicators
--json       Machine-parseable JSON
--verbose    More detail
--debug      Internal diagnostics
```

---

## Phase 5: SDK Interface

### 5.1 Exports from `src/index.ts`

```typescript
export { clone, CloneOptions, CloneResult } from './commands/clone';
export { list, ListOptions, SessionInfo } from './commands/list';
export { info, InfoOptions, SessionDetails } from './commands/info';
```

### 5.2 SDK Usage

```typescript
import { clone } from 'ccs-cloner';

// Remove 80% of tools, truncate remaining
const result = await clone({
  sessionId: 'abc-123',
  stripTools: 80,
  truncateRemaining: true,
});

console.log(result.newSessionId);

// Pure copy (no modifications, thinking preserved)
const copy = await clone({
  sessionId: 'abc-123',
});
```

---

## Phase 6: Testing & Verification

### 6.1 Unit Tests

- `parseSession` - JSONL parsing
- `identifyTurns` - turn boundary detection
- `applyRemovals` - tool/thinking removal
- `fixLeafUuid` - summary repair
- `repairParentUuidChain` - UUID chain repair

### 6.2 Integration Tests

Using fixture sessions:
1. Clone with default 80% tool removal
2. Clone with 95% tool removal (heavily-cloned session scenario)
3. Clone with `--strip-tools=0 --truncate-remaining` (truncate-only)
4. Clone with `--strip-tools --truncate-remaining` (remove + truncate)
5. Pure copy (no flags, verify thinking preserved)
6. Verify all sidecar files created (todos, session-env)
7. Verify sessions-index.json updated
8. Verify leafUuid points to valid UUID after removal

### 6.3 Manual Verification

```bash
# Build and link
bun run build && bun link

# Test clone
ccs-cloner clone <real-session-id> --strip-tools

# Verify in Claude Code
claude --resume  # Should show cloned session
# Resume it, verify context shows normal
```

---

## File Locations

### Source to Port From
- `/Users/leemoore/code/coding-agent-manager/src/services/session-clone.ts`
- `/Users/leemoore/code/coding-agent-manager/src/types.ts`
- `/Users/leemoore/code/coding-agent-manager/src/schemas/clone-v2.ts`

### New Files to Create
- `/Users/leemoore/code/agent-cli-tools/ccs-cloner/` (entire directory)

### Reference Docs
- `/Users/leemoore/code/agent-cli-tools/README.md`
- `/Users/leemoore/code/agent-cli-tools/DESIGN.md`
- `/Users/leemoore/code/agent-cli-tools/REFERENCE.md`
- `/Users/leemoore/code/coding-agent-manager/docs/reference/claude-code-session-storage-formats.md`

---

## Implementation Order

1. **Scaffold** - package.json, tsconfig, directory structure
2. **Types** - Port types.ts with modifications
3. **Core logic** - Port session-clone.ts functions
4. **New fixes** - Add leafUuid fix, sidecar creation, index update, synthetic filtering
5. **CLI framework** - command-def.ts, cli-runner.ts, help.ts
6. **Commands** - clone, list, info
7. **SDK exports** - index.ts
8. **Tests** - Unit + integration
9. **Documentation** - README with examples

---

## Open Questions

None - ready to implement.
