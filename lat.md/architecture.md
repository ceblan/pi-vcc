# Architecture

pi-vcc uses a deterministic, multi-stage pipeline to compress conversations instead of relying on an LLM. The architecture separates normalization, filtering, extraction, formatting, and merging concerns.

## Compaction Pipeline

The main compaction flow is: **normalize → filter → build sections → brief transcript → format → merge**

The entry point is [[src/core/summarize.ts#compile]] which orchestrates:

```
messages
    │
    ▼
[[src/core/normalize.ts#normalize]]  (convert Message → NormalizedBlock[])
    │
    ▼
[[src/core/filter-noise.ts#filterNoise]]  (remove noise blocks)
    │
    ▼
[[src/core/build-sections.ts#buildSections]]  (extract goals, files, commits, prefs)
    │
    ▼
[[src/core/format.ts#formatSummary]]  (format header + brief transcript)
    │
    ▼
merge with previous summary (if any)
```

## Hook System

pi-vcc registers a hook via [[src/hooks/before-compact.ts#registerBeforeCompactHook]] listening to the `session_before_compact` event.

Flow:
1. Hook receives event with `customInstructions` = `PI_VCC_COMPACT_INSTRUCTION`
2. Builds "own cut" - finds last compaction entry and determines live messages
3. Calls [[src/core/summarize.ts#compile]] to produce summary
4. Returns `compaction` object with summary, details, and firstKeptEntryId

## Recall System

Recall is implemented by reading raw session JSONL files:

1. [[src/core/load-messages.ts#loadAllMessages]] reads session file
2. [[src/core/render-entries.ts#renderMessage]] formats each message
3. [[src/core/search-entries.ts#searchEntries]] performs BM25 or regex search
4. [[src/core/format-recall.ts#formatRecallOutput]] formats results

The recall system searches content before compaction by reading the raw session file.

## Merge Policy

When a conversation is compacted repeatedly, pi-vcc merges summaries:

- **Session Goal**: Deduplicated line-level merge, max 8 items
- **Files And Changes**: Merged by category, paths deduped, Modified drops from Created
- **Outstanding Context**: Fresh only (volatile - blockers change)
- **User Preferences**: Deduplicated against goals, max 15 items
- **Brief Transcript**: Appended with rolling window cap (120 lines)

## Section Types

[[src/sections.ts#SectionData]] defines sections:

| Section | Purpose | Merge Policy |
|---------|---------|--------------|
| `sessionGoal` | User's task/goal from first message | Dedupe, cap 8 |
| `filesAndChanges` | Files read, modified, created | Merge by category |
| `commits` | Git commits made | Fresh only, last 8 |
| `outstandingContext` | Errors and blockers | Fresh only |
| `userPreferences` | Explicit user preferences | Dedupe vs goals |
| `briefTranscript` | Compressed conversation flow | Append, rolling cap |

The brief transcript hides tool results but shows errors, collapses repeated tool calls, and truncates long text at token boundaries.