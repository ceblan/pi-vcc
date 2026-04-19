# Tests

Test suite covers normalization, filtering, extraction, formatting, search, and real session integration.

## normalize.test.ts

Verifies message normalization converts various Pi message formats to structured blocks.

### normalize returns empty for empty input

normalize([]) should return empty array.

### normalize normalizes user message (string content)

Converts user role with string content to {kind:"user", text...} block.

### normalize normalizes assistant text message

Converts assistant role with text content.

### normalize splits assistant thinking + text

Produces separate thinking and assistant blocks from mixed content.

### normalize normalizes tool call

Extracts tool name and arguments from toolCall content part.

### normalize normalizes tool result

Converts toolResult role to {kind:"tool_result"...} block.

### normalize handles mixed message sequence

Correctly sequences 4-part conversation: user → tool_call → tool_result → assistant.

### normalize produces image placeholder for user image content

Adds [image: mimeType] placeholder for image content parts.

### normalize skips unknown message roles gracefully

Ignores roles like bashExecution during normalization.

## filter-noise.test.ts

Tests noise filtering removes unwanted blocks.

### filterNoise removes thinking blocks

Thinking blocks filtered out completely.

### filterNoise removes noise tool calls and results

TodoWrite/Read and similar noise tools removed.

### filterNoise removes user blocks that are pure XML wrappers

XML-only content like <system-reminder> removed entirely.

### filterNoise cleans XML wrappers from user text but keeps real content

Strips XML but preserves actual user content.

### filterNoise removes known noise strings

"Continue from where you left off." pattern filtered.

### filterNoise preserves non-noise tool calls

Edit/Write/etc. tools kept in output.

## build-sections.test.ts

Tests section building from normalized blocks.

### buildSections returns all-empty for no blocks

Empty blocks produce empty sections.

### buildSections populates sections from realistic blocks

Extracts goals, files, transcript from typical conversation.

### buildSections captures outstanding context from errors

Error tool results become outstanding blockers.

### buildSections brief transcript hides tool results but shows errors

Non-error tool results omitted, errors shown.

### buildSections brief transcript merges adjacent assistant sections

Multiple assistant blocks combine into one [assistant] section.

## brief.test.ts

Tests brief transcript generation.

### compileBrief returns empty string for no blocks

Empty blocks produce empty string.

### compileBrief renders user and assistant text

Outputs [user] and [assistant] headers with content.

### compileBrief collapses tool calls to one-liners under [assistant]

Tool calls formatted as "* ToolName "args"".

### compileBrief hides non-error tool results

Successful tool results omitted from transcript.

### compileBrief shows tool errors with first line

Errors show as [tool_error] with first error line.

### compileBrief hides thinking blocks

Thinking content completely filtered.

### compileBrief merges adjacent assistant sections

No blank line between consecutive assistant sections.

### compileBrief does NOT merge assistant after user

User block breaks assistant section merge.

### compileBrief truncates long user text

Long user messages truncated at token boundary.

### compileBrief truncates long assistant text

Long assistant messages truncated at token boundary.

### compileBrief renders a realistic conversation flow

Full conversation renders correctly with all features.

## sanitize.test.ts

Tests text sanitization.

### sanitize strips ANSI escape codes

\x1b[31mred\x1b[0m → red.

### sanitize normalizes CRLF to LF

Windows line endings converted to Unix.

### sanitize strips bare CR

Standalone CR characters removed.

### sanitize strips control characters but preserves newlines and tabs

Only control chars 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F stripped.

### sanitize passes clean text unchanged

No-change path works.

## render-entries.test.ts

Tests message rendering for recall.

### renderMessage renders user message

Index, role, summary fields populated.

### renderMessage renders assistant text

Role is "assistant".

### renderMessage renders tool result

Tool name in brackets, content shown.

### renderMessage renders tool call arguments with values

Arguments summarized: Read(path=a.ts).

### renderMessage renders error tool result with prefix

ERROR prefix added to summary.

### renderMessage truncates long user text

300 char max applied.

### renderMessage renders bashExecution message

Command and output shown.

### renderMessage handles message with undefined content

Empty summary for undefined.

## format.test.ts

Tests summary formatting.

### formatSummary returns empty string for all-empty sections

Empty SectionData produces empty string.

### formatSummary formats a single header section

[Header] with - items rendered.

### formatSummary separates header and brief transcript with ---

Separator between sections and transcript.

### formatSummary renders brief transcript alone when no header sections

Transcript-only format.

### formatSummary joins multiple header sections with blank line

Sections separated by \n\n.

## format-recall.test.ts

Tests recall output formatting.

### formatRecallOutput shows no-match message with query

"No matches for ..." shown.

### formatRecallOutput shows no-entries message without query

"No entries" shown.

### formatRecallOutput formats entries with index and role

#N [role] format.

### formatRecallOutput shows match count with query

Found N matches message.

## content.test.ts

Tests text utilities.

### textParts returns empty for undefined content

Undefined/null returns [].

### textParts wraps string content

String wrapped in array.

### textParts extracts text parts from array content

Filters to type:text parts only.

## search-entries.test.ts

Tests search with BM25 and regex.

### searchEntries returns all for empty query

Empty/null query returns all entries.

### searchEntries filters by single term

Single term exact match.

### searchEntries returns empty for no match

No match returns [].

### searchEntries finds keyword beyond clip boundary in full content

Full message searched, not just clipped summary.

### searchEntries returns snippet around matched term

Snippet shows ±2 lines around match.

### searchEntries supports regex pattern: alternation

login|auth pattern works.

### searchEntries supports regex pattern: wildcard

Read.*auth pattern works.

### searchEntries falls back to escaped literal for invalid regex

Invalid regex (foo treated as literal.

### searchEntries regex is case-insensitive

FIX|ROOT matches fix/ROOT.

### searchEntries natural language query uses OR logic

Multiple words match any term.

### searchEntries natural language ranks by BM25 score

Better matches first.

### searchEntries filters stopwords from queries

"the root cause" → root, cause only.

### searchEntries keeps all terms if all are stopwords

Fallback preserves query.

### searchEntries snippet shows context lines around match

±2 lines in snippet.

### searchEntries snippet handles match at beginning

Start-of-text handled correctly.

## report.test.ts

Tests compaction report generation.

### buildCompactReport includes before and after compact metrics

All metrics populated correctly.

### buildCompactReport marks recall probe coverage for goal and file queries

Recall probes check if key info found in summary.

## compile.test.ts

Tests full compaction with merging.

### compile returns empty string for no messages

Empty messages → empty summary.

### compile produces hybrid output with header + brief transcript

Header + "---" + transcript.

### compile merges previous summary goals

Goals combined with dedup.

### compile appends brief transcript on merge

Transcripts concatenated.

### compile outstanding context is volatile (fresh only)

Older blockers replaced.

### compile caps long brief transcript with rolling window

120 line max with "...earlier lines omitted".

## extract-goals.test.ts

Tests goal extraction.

### extractGoals returns empty for no blocks

Empty input → empty output.

### extractGoals returns empty when no user blocks

No user role → no goals.

### extractGoals extracts first user message lines as goals

First user block lines become goals.

### extractGoals takes max 3 lines from first user block

Cap applied.

### extractGoals ignores subsequent user blocks

Only first user block considered for initial goals.

### extractGoals detects scope change with explicit pivot keywords

"actually", "instead" trigger scope change marker.

### extractGoals detects scope change from new task statements

"Now I want", "let me do" trigger.

### extractGoals keeps latest scope change only

Only most recent pivot recorded.

### extractGoals skips noise short user messages as goals

"ok", "yes" ignored.

## extract-preferences.test.ts

Tests preference extraction.

### extractPreferences returns empty for no blocks

Empty → [].

### extractPreferences captures preference patterns from user

"prefer TypeScript" extracted.

### extractPreferences ignores assistant blocks

Assistant preferences ignored.

### extractPreferences captures please use pattern

"please use bun" extracted.

## real-sessions.test.ts

Integration tests with real session data.

### real session integration compiles copied large sessions without mutating originals

Session data copied before test, original unchanged.

### real session integration uses read-only copied fixtures

Copy path != source path.