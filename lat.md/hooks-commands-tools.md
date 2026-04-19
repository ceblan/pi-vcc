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