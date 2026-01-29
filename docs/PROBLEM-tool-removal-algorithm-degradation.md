# Problem Analysis: Tool Removal Algorithm Degradation Across Multiple Clones

## Executive Summary

The current tool removal algorithm becomes progressively less effective when the same session is cloned multiple times. This document details the problem, analyzes root causes, explores solution options, and documents the decision rationale.

---

## Problem Statement

When cloning a Claude Code session multiple times (common when a long-running session repeatedly hits context limits), each successive clone removes proportionally fewer tool calls than the previous one, eventually rendering the tool removal feature nearly useless.

### Observed Behavior

**First Clone (100 turns, 80% removal):**
- 80 turns have tools stripped
- 20 turns retain tools
- Result: Significant context reduction

**Continue working, session grows to 200 turns, clone again (80% removal):**
- 80% of 200 = 160 turns targeted for stripping
- But turns 1-80 are already tool-free from first clone
- Only 80 new turns actually get stripped (turns 81-160)
- 40 turns retain tools (turns 161-200)
- Result: Less effective than expected

**Continue to 300 turns, clone again (80% removal):**
- 80% of 300 = 240 turns targeted
- Turns 1-160 already tool-free
- Only 80 new turns stripped (turns 161-240)
- 60 turns retain tools (turns 241-300)
- Result: Even less effective

### The Degradation Pattern

| Clone # | Total Turns | Turns Stripped | Already Empty | New Stripping | Turns With Tools |
|---------|-------------|----------------|---------------|---------------|------------------|
| 1 | 100 | 80 | 0 | 80 | 20 |
| 2 | 200 | 160 | 80 | 80 | 40 |
| 3 | 300 | 240 | 160 | 80 | 60 |
| 4 | 400 | 320 | 240 | 80 | 80 |

The number of turns with tools grows linearly with each clone cycle, despite using the same "80% removal" setting.

### User Experience Impact

*(Numbers below are illustrative, not measured)*

Users expect consistent behavior:
- Clone at 180K tokens → drop to ~20K
- Clone again at 180K → drop to ~25K (slight growth acceptable)
- Clone again at 180K → drop to ~30K

Actual experience:
- Clone 1: 180K → 20K
- Clone 2: 180K → 45K
- Clone 3: 180K → 75K
- Clone 4: 180K → 110K (clone barely helps anymore)

---

## Root Cause Analysis

### The Fundamental Flaw

The algorithm calculates the removal percentage based on **all turns**, not **turns that have tool calls**.

```typescript
// Current implementation
const toolBoundary = Math.floor((totalTurns * removalPercentage) / 100);
// Removes tools from turns 0 to toolBoundary-1
```

After the first clone, a significant portion of early turns have no tools. The algorithm "wastes" its removal budget processing these already-empty turns.

### Why This Happens

1. **Percentage calculated on wrong denominator**: Uses total turn count, not tool-bearing turn count
2. **No awareness of prior clones**: Algorithm doesn't detect that tools have already been removed
3. **Static boundary calculation**: The "80% boundary" moves with total turns, not with tool distribution

### Mathematical Model

Let:
- T = total turns
- P = removal percentage (e.g., 80)
- E = already-empty turns (from prior clones)
- A = turns with actual tools = T - E

Current algorithm removes from: `floor(T * P / 100)` turns

Effective removal: `max(0, floor(T * P / 100) - E)` turns with tools

As E grows (more prior clones), effective removal decreases even as T grows.

---

## Solution Options Explored

### Option 1: Percentage of Tool-Bearing Turns

**Mechanism:**
1. Scan all turns, identify which have tool calls
2. Calculate 80% of those specifically
3. Strip tools from the oldest 80% of tool-bearing turns

**Pros:**
- Directly fixes the bug — each clone strips 80% of actual tool content
- Same mental model for users ("strip 80% of tool context")
- Same CLI interface, just corrected semantics

**Cons:**
- Requires a counting pass before removal (trivial cost)
- Still percentage-based — harder to reason about exact results
- You don't know how deep into history the percentage reaches
- Edge cases with sparse tool distribution

**Analysis:**
This fixes the multi-clone bug but retains percentage-based thinking. Users still need to understand tool distribution to predict results.

### Option 2: Keep Last N Turns (Absolute Count)

**Mechanism:**
1. Count turns that have tool calls
2. Keep the last N of those (everything before → removed)
3. Optionally truncate a portion of the kept turns

**Pros:**
- Predictable: "keep last 20" always means 20, regardless of session history
- Each clone behaves identically
- User doesn't need to know tool distribution
- Simple mental model

**Cons:**
- What's the right N? Requires good defaults
- Doesn't scale with session size (debatable if this matters)
- Requires UX change to flags

**Analysis:**
This fundamentally changes the model from "remove X%" to "keep last N". Each clone is equally effective because we're specifying what to keep, not what to remove relative to a changing total.

### Option 3: Size/Token Budget

**Mechanism:**
- "Keep last 50KB of tool content"
- Walk backwards from newest, accumulate tool content size, stop when budget exhausted

**Pros:**
- Directly tied to the actual constraint (context window)
- Handles variable tool output sizes
- Most accurate for context reduction goal

**Cons:**
- More complex implementation
- User must think in KB/tokens rather than turns
- Harder to reason about
- Might cut in the middle of a turn

**Analysis:**
Theoretically most correct, but adds cognitive overhead. Users think in terms of "conversations" not "kilobytes".

### Option 4: Detect Already-Stripped Turns

**Mechanism:**
- Skip turns with no tools when calculating removal zone
- Effectively same as Option 1 but approached differently

**Pros:**
- Could theoretically preserve backward compatibility

**Cons:**
- Can't distinguish "had tools, got stripped" from "never had tools"
- More complex detection logic
- Strictly worse than Option 1

**Analysis:**
This doesn't work reliably because we can't tell if a turn never had tools or had them removed. Discarded.

### Option 5: Metadata Tracking Across Clones

**Mechanism:**
- Inject metadata into sessions tracking "generation count" or "original tool count"
- Use metadata to calculate effective removal

**Pros:**
- Could enable sophisticated multi-clone strategies

**Cons:**
- Adds complexity to session format
- Requires managing metadata across clones
- Over-engineered for the problem

**Analysis:**
Adds too much complexity for the benefit. The problem can be solved without session metadata.

---

## Decision: Option 2 with Presets

### Why Option 2?

1. **Predictable behavior**: Each clone is equally effective regardless of prior clones
2. **Simple mental model**: "Keep the last 20 tool interactions" is intuitive
3. **Matches user intent**: Users want to preserve recent context, not remove a percentage
4. **Enables presets**: Easy to define "conservative", "aggressive", "extreme" as fixed values

### Why Option 2 Over Option 1?

Option 1 is a valid alternative that would also fix the bug. We felt Option 2 was stronger because:
- It reframes the question from "how much to remove" to "how much to keep" — more intuitive for the use case
- Preset names (default, aggressive, extreme) are easier to choose than percentages
- Behavior is predictable regardless of session history or tool distribution

### The Scaling Question

Concern was raised: Option 2 doesn't scale with session size — a 500-turn session and 50-turn session both keep the same N.

Counter-argument: This is actually desirable. The context from 500 turns ago isn't more relevant just because the session is longer. What matters is preserving *recent* tool context, and "recent" should be a fixed window, not a percentage of total history.

---

## Chosen Solution: Keep Last N + Truncation Percentage

### The Model

1. **Unit**: Turns that have tool calls (not all turns, not individual tool calls)
2. **Keep**: Last N of those turns (everything before → tools removed entirely)
3. **Truncate**: Oldest X% of the kept turns (all tool calls in those turns get truncated)
4. **Preserve**: Remaining kept turns at full fidelity

### Why Turns, Not Individual Tool Calls?

A turn might have 20 tool calls (e.g., a refactoring that touches many files). These should be treated uniformly — either all truncated or all preserved. Splitting a turn's tool calls would create incoherent context.

### Why Two-Tier (Truncate + Preserve)?

- **Full fidelity** for the most immediately relevant context (you need exact tool outputs for recent work)
- **Truncated "tombstones"** for slightly older context (you know what was done, but not every detail)
- **Removed** for old context (details no longer matter)

This provides a graceful degradation rather than a hard cutoff.

### Presets

| Preset | Keep | Truncate % | Result |
|--------|------|------------|--------|
| `default` | 20 turns | 50% | 10 truncated, 10 full fidelity |
| `aggressive` | 10 turns | 50% | 5 truncated, 5 full fidelity |
| `extreme` | 0 turns | — | All tools removed |

### CLI Interface

```bash
ccs-cloner clone <id> --strip-tools            # uses default preset
ccs-cloner clone <id> --strip-tools=aggressive # uses aggressive preset
ccs-cloner clone <id> --strip-tools=extreme    # removes all tools
```

Custom presets can be defined in config files for power users.

---

## Trade-offs Accepted

1. **Breaking change**: Old percentage-based flags won't work the same way
2. **Less flexibility**: Can't specify arbitrary percentages (mitigated by custom presets in config)
3. **Fixed defaults**: Need to pick good values for N — starting with intuitive defaults (20, 10) that can be tuned over time with real usage feedback

## Trade-offs Avoided

1. **Complexity**: Rejected metadata tracking across clones
2. **Cognitive overhead**: Rejected size/token-based budgets
3. **Incoherence**: Rejected per-tool-call granularity (kept turn-level)

---

## Verification Criteria

After implementation:

1. **Clone 1 and Clone 2 should behave nearly identically** — both should reduce to approximately the same context size (slight growth acceptable due to conversation content accumulation)

2. **Presets should be self-explanatory** — `--quickstart` output should be sufficient for an agent to use correctly

3. **Edge cases should be handled gracefully**:
   - Session with fewer tool-turns than N → keep all
   - Session with no tool-turns → no-op
   - Very short sessions → still work correctly

---

## Open Questions for Review

1. Is 50% truncation the right split, or should aggressive truncate more (e.g., 80%)?
2. Should we support `--strip-tools=N` for power users who want exact control, or force use of presets/config?
3. Should thinking block removal remain automatic (100% when any tools touched)?
