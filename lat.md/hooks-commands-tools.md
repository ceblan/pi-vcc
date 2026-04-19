# Hooks, Commands, and Tools

pi-vcc integrates with Pi via a hook system, slash commands, and a tool. All registration happens in [[index.ts]].

## Hook: before-compact.ts

The `session_before_compact` hook intercepts Pi's compaction flow and replaces it with pi-vcc's deterministic algorithm.

- [[src/hooks/before-compact.ts#registerBeforeCompactHook]] - Main registration

Flow:
1. Listens to `session_before_compact` event
2. Checks for `customInstructions === PI_VCC_COMPACT_INSTRUCTION`
3. Builds "own cut": finds last compaction entry, determines live message range
4. Returns null if ≤2 messages (nothing to compact)
5. Calls compile() with messages, previousSummary, fileOps
6. Returns compaction object with summary and details

Returns:
```typescript
{
  compaction: {
    summary: string,
    details: PiVccCompactionDetails,
    tokensBefore: number,
    firstKeptEntryId: string
  }
}
```

`PiVccCompactionDetails` includes:
- compactor: "pi-vcc"
- version: 1
- sections: header names found
- sourceMessageCount: messages compacted
- previousSummaryUsed: boolean

## Command: pi-vcc.ts

The `/pi-vcc` slash command triggers manual compaction.

- [[src/commands/pi-vcc.ts#registerPiVccCommand]] - Registration

Usage:
```
/pi-vcc
```

Behavior:
1. Calls ctx.compact() with customInstructions=PI_VCC_COMPACT_INSTRUCTION
2. onComplete: shows notification with stats (summarized count, kept count, estimated tokens)
3. onError: handles "cancelled" / "Already compacted" gracefully

## Command: vcc-recall.ts

The `/pi-vcc-recall` slash command searches conversation history.

- [[src/commands/vcc-recall.ts#registerVccRecallCommand]] - Registration

Usage:
```
/pi-vcc-recall <query> [page:N]
/pi-vcc-recall          # show recent 25 messages
/pi-vcc-recall auth     # search for "auth"
/pi-vcc-recall page:2   # page 2 of results
```

Behavior:
1. No query: loads recent 25 messages
2. With query: runs searchEntries with query
3. Supports page:N pagination (5 per page)
4. Sends result as customType: "vcc-recall" message

## Tool: recall.ts

The `vcc_recall` tool provides programmatic search access to conversation history.

- [[src/tools/recall.ts#registerRecallTool]] - Registration

Tool parameters:
```typescript
{
  query?: string,        // Search terms or regex
  expand?: number[],      // Entry indices for full content
  page?: number          // Page number (default 1)
}
```

Behavior:
1. No query: returns recent 25 entries
2. query + expand: ignored (expand requires no query)
3. No query + expand: returns full untruncated content for indices
4. With query: BM25 or regex search, 5 results per page
5. Returns as text content

## Tool: search.ts

The `vcc_search` tool provides cross-session search with expand support.

- [[src/tools/search.ts#registerSearchTool]] - Registration

Tool parameters:
```typescript
{
  query: string,              // Search terms or regex
  scope?: "project" | "all",  // Search scope
  sessions?: string[],         // Limit to specific session IDs
  maxResults?: number,         // Max total results (default: 30)
  maxPerSession?: number,      // Max per session (default: 3)
  page?: number,               // Pagination (1-based)
  expand?: { session: string, entry: number }[],  // Expand entries for full content
}
```

Behavior:
1. Normal mode: ripgrep search across sessions, grouped results with pagination
2. Expand mode (expand provided): skip search, load specific entries by line number
3. Uses `loadMessageAtLine` to read JSONL directly by line number (avoids index remapping)
4. Session ID resolution: supports full IDs and 8-char truncated prefixes
5. Groups expanded entries by session with warnings for missing entries

## Command: vcc-search.ts

The `/vcc-search` slash command searches sessions interactively with a TUI overlay (when UI available) or falls back to plain text.

- [[src/commands/vcc-search.ts#registerVccSearchCommand]] - Registration

Usage:
```
/vcc-search <query> [--scope all|project] [--page N]
```

Behavior with TUI (`ctx.hasUI = true`):
1. Parse args, find sessions, run ripgrep, format results
2. Show interactive [[src/ui/search-overlay.ts#showSearchOverlay]] overlay — returns `OverlayResult`
3. User navigates with ↑↓, presses `e` (inject) or `w` (view in browser)
4. `kind === "view"`: call [[src/core/open-browser.ts#openSessionInBrowser]], notify, return
5. `kind === "inject"`: load session messages via `loadAllMessages`, compile summary via `compile`, write `vcc.md`, inject `vcc-context` message with `triggerTurn: true`

Behavior without TUI (`ctx.hasUI = false`):
- Sends text table of results as `vcc-search` message (same as before)

## UI: search-overlay.ts

TUI overlay component for `/vcc-search` — visual session browser with fuzzy search.

- [[src/ui/search-overlay.ts#showSearchOverlay]] - Public API — returns `Promise<OverlayResult>`

Exported types:
- `OverlayResult = { kind: "inject"; row: FormattedSessionRow } | { kind: "view"; row: FormattedSessionRow } | null`

Layout:
- Flat list of project-headers (dim, non-selectable) + session-rows (selectable)
- Each session row: date + 8-char ID + match count (line 1), prompt (line 2, dim)
- Scroll indicator when list exceeds `MAX_VISIBLE_ROWS = 10`
- Search bar (when active): `◎  <query>│` or `◎  │type to filter...` placeholder
- Footer (normal mode): `↑↓ navigate  / search  o compress+inject  p view in browser  esc close`
- Footer (search mode): `type to filter  ↑↓ navigate  alt+o inject  alt+p view  esc exit search`

Key bindings (normal mode):
- `↑` / `↓` — navigate session rows (project-headers are skipped)
- `/` — activate fuzzy search mode
- `o` or `alt+o` — compress+inject: returns `{ kind: "inject", row }` to caller
- `p` or `alt+p` — view in browser: returns `{ kind: "view", row }` to caller
- `esc` — cancel → returns `null`

Key bindings (search mode):
- Printable characters — append to search query
- `backspace` — delete last character from query
- `↑` / `↓` — navigate filtered results
- `alt+o` — inject selected session
- `alt+p` — view selected session in browser
- `esc` — exit search mode (returns to normal mode, resets selection)

Fuzzy search:
- Uses `fuzzyFilter` from `@mariozechner/pi-tui` with `getText` callback
- Searches across: prompt, date, sessionId, project name
- When active, only session-rows shown (no project-headers)
- Empty query shows all items (unfiltered)
- "No matching sessions" shown when filter yields no results

Follows `pi-token-burden/src/report-view.ts` pattern: ANSI manual rendering, `ctx.ui.custom()`, `tui.requestRender()` after every input.

## sections.ts

Section data structure used by build-sections and format.

- [[src/sections.ts#SectionData]] - Interface

```typescript
interface SectionData {
  sessionGoal: string[];
  outstandingContext: string[];
  filesAndChanges: string[];
  commits: string[];
  userPreferences: string[];
  briefTranscript: string;
  transcriptEntries: TranscriptEntry[];
}
```

## details.ts

Compaction details returned to Pi after compaction.

- [[src/details.ts#PiVccCompactionDetails]] - Interface

```typescript
interface PiVccCompactionDetails {
  compactor: "pi-vcc";
  version: number;
  sections: string[];
  sourceMessageCount: number;
  previousSummaryUsed: boolean;
}
```