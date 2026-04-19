# Core Modules

The core modules handle message normalization, filtering, section building, formatting, and search. These are the building blocks of the compaction pipeline.

## normalize.ts

Converts Pi's Message objects to standardized NormalizedBlock types. Handles various content formats including images and mixed content.

- [[src/core/normalize.ts#normalize]] - Main entry point, processes array of messages
- [[src/core/normalize.ts#normalizeOne]] - Processes single message to blocks

**Input**: Message[]  
**Output**: NormalizedBlock[] (user | assistant | tool_call | tool_result | thinking)

## content.ts

Utility functions for text manipulation: clipping, sentence boundary detection, line extraction.

- [[src/core/content.ts#textOf]] - Extract text from message content (handles mixed arrays)
- [[src/core/content.ts#textParts]] - Extract text parts from mixed content
- [[src/core/content.ts#clip]] - Unicode-aware word-boundary truncation
- [[src/core/content.ts#clipSentence]] - Clip to last sentence boundary
- [[src/core/content.ts#firstLine]] - Get first line of text
- [[src/core/content.ts#nonEmptyLines]] - Split and filter empty lines
- [[src/core/content.ts#snippet]] - Extract context snippet around term match

## filter-noise.ts

Removes noise blocks that don't carry semantic meaning: thinking, noise tools, XML wrappers.

- [[src/core/filter-noise.ts#filterNoise]] - Main filtering function

Removes:
- Thinking blocks (redacted/unredacted)
- Tool calls: TodoWrite, TodoRead, ToolSearch, WebSearch
- Tool results for noise tools
- XML wrapper content: system-reminder, ide_opened_file, etc.
- Known noise strings: "Continue from where you left off.", etc.

## sanitize.ts

Strips ANSI escape codes and control characters from text.

- [[src/core/sanitize.ts#sanitize]] - Strips \r, ANSI codes, control chars

## tool-args.ts

Extracts file paths and summarizes tool arguments.

- [[src/core/tool-args.ts#extractPath]] - Extract file path from args (path, file_path, filePath, file keys)
- [[src/core/tool-args.ts#summarizeToolArgs]] - Create summary string from args

## skill-collapse.ts

Collapses <skill> blocks to single-line markers to reduce noise in goals/preferences.

- [[src/core/skill-collapse.ts#collapseSkillLines]] - Process array of lines
- [[src/core/skill-collapse.ts#collapseSkillText]] - Process raw text

Replaces `<skill name="X">...</skill>` with `[skill: X]`.

## brief.ts

Builds compressed "brief transcript" showing user/assistant flow and tool calls. This is the conversation summary that replaces full message history.

- [[src/core/brief.ts#buildBriefSections]] - Build structured BriefLine sections from blocks
- [[src/core/brief.ts#stringifyBrief]] - Convert sections to text format
- [[src/core/brief.ts#compileBrief]] - Convenience: blocks → text
- [[src/core/brief.ts#sectionsToTranscript]] - Convert sections to structured TranscriptEntry[]

Features:
- Token-aware truncation (stops at word boundary, counts stop words)
- Self-talk prefix removal (strips "Hmm, actually, ok, wait..." prefixes)
- Tool compression: cd/pipe tail stripping, command truncation
- Collapses repeated identical tool calls with count
- Collapses repeated [tool_error] sections
- Hides non-error tool results
- Shows errors with first line only

Output format:
```
[user]
task description (#0)

[assistant]
tool summary

[tool_error] bash
error first line
```

## build-sections.ts

Orchestrates section extraction from normalized blocks.

- [[src/core/build-sections.ts#buildSections]] - Main entry point

Calls:
- [[src/extract/goals.ts#extractGoals]] - Extract session goal
- [[src/extract/files.ts#extractFiles]] - Extract file activity
- [[src/extract/commits.ts#extractCommits]] + formatCommits - Extract git commits
- [[src/extract/preferences.ts#extractPreferences]] - Extract user preferences
- [[src/core/brief.ts#buildBriefSections]] - Brief transcript
- `extractOutstandingContext` (local) - Extract blockers from errors/assistant text

## format.ts

Formats the final summary output with header sections and brief transcript.

- [[src/core/format.ts#formatSummary]] - Main formatting function
- [[src/core/format.ts#capBrief]] - Cap brief transcript to 120 lines with rolling window
- RECALL_NOTE - Hint prompt to use vcc_recall

Output format:
```
[Session Goal]
- task 1
- task 2

[Files And Changes]
- Modified: a.ts, b.ts
- Created: new.ts

---

[user]
task (#0)
[assistant]
* Read "file"
...
```

## render-entries.ts

Renders messages for recall/search display.

- [[src/core/render-entries.ts#renderMessage]] - Format single message
- [[src/core/render-entries.ts#RenderedEntry]] - Output interface

## load-messages.ts

Loads messages from session JSONL file.

- [[src/core/load-messages.ts#loadAllMessages]] - Load and render messages from session file

Returns both rendered entries and raw messages for search.

## mark-complete.ts

(This module appears in some contexts but was not read - may not exist in current version.)

## report.ts

Generates detailed compaction report with metrics and recall probes.

- [[src/core/report.ts#buildCompactReport]] - Main report builder
- [[src/core/report.ts#CompactReport]] - Report interface

Report sections:
- `summary` - The formatted summary string
- `before` - Message count, role counts, block counts, input chars, tokens, top files, preview
- `after` - Summary length, tokens, section count, goals/blockers count, transcript lines
- `compression` - chars before/after, ratio, messages count
- `recall` - Probes checking if key info (goal, file, problem) appears in summary

## search-entries.ts

Search engine for vcc_recall with BM25 ranking and regex support.

- [[src/core/search-entries.ts#searchEntries]] - Main search function
- [[src/core/search-entries.ts#SearchHit]] - Hit interface with snippet

Features:
- Regex support: treats query as regex if contains metacharacters
- Natural language: BM25 scoring with stopword filtering
- Line-based snippets: ±2 lines around match
- Stopwords: common English words filtered from queries
- Handles both RenderedEntry[] and Message[] for full-text search

## format-recall.ts

Formats recall search results for display.

- [[src/core/format-recall.ts#formatRecallOutput]] - Format entries with optional query/header

## summarize.ts

Main compilation entry point - orchestrates normalize → filter → buildSections → format → merge.

- [[src/core/summarize.ts#compile]] - Primary export
- [[src/core/summarize.ts#CompileInput]] - Input interface (messages, previousSummary, fileOps)

Calls:
- [[src/core/normalize.ts#normalize]]
- [[src/core/filter-noise.ts#filterNoise]]
- [[src/core/build-sections.ts#buildSections]]
- [[src/core/format.ts#formatSummary]]
- Merge logic for previous summary