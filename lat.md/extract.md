# Extract Modules

Extraction modules pull structured data from normalized conversation blocks: goals, files, commits, and user preferences.

## goals.ts

Extracts user intentions and tasks from user message blocks.

- [[src/extract/goals.ts#extractGoals]] - Main extraction function

Logic:
1. Takes first user block content as primary goal
2. Filters noise: short messages, XML/code/path patterns
3. Truncates at command templates (e.g., `/issues` signal lines)
4. Detects scope changes via keywords: "actually", "instead", "change of plan", "new task", "pivot"
5. For subsequent user blocks, only updates on explicit scope change keywords
6. Collapses skill blocks to [skill: name] markers
7. Maximum 8 goals returned

Returns array with optional "[Scope change]" marker for detected pivots.

## files.ts

Tracks file activity: read, modified, created.

- [[src/extract/files.ts#extractFiles]] - Main extraction function
- Takes optional FileOps from Pi for initial file set
- Tool classification:
  - Read: Read, read_file, View
  - Write (modify): Edit, Write, edit, write, edit_file, write_file, MultiEdit
  - Create: Write, write, write_file

Features:
- Finds longest common directory prefix and trims for readability
- Dedup: files in Modified are removed from Created

## commits.ts

Extracts git commits from bash tool calls and output.

- [[src/extract/commits.ts#extractCommits]] - Extract commits from blocks
- [[src/extract/commits.ts#formatCommits]] - Format for summary output

Logic:
1. Finds `git commit -m "..."` commands in bash calls
2. Parses message from: -m "msg", -m 'msg', or $-quoted
3. Looks at next 2 blocks for tool_result containing hash
4. Hash patterns: `[branch hash]`, `hash..hash`, or plain hex
5. Dedups by message+hash pair
6. Returns up to 8 most recent commits

## preferences.ts

Extracts explicit user preferences from messages.

- [[src/extract/preferences.ts#extractPreferences]] - Main extraction
- [[src/extract/preferences.ts#dedupPreferencesAgainstGoals]] - Deduplicate against goals

Patterns matched:
- `prefer(s|red|ring)? \w`
- `don't want`
- `always (use|do|run|prefer|...)` / `never (use|do|...)`
- `please (use|avoid|...)`
- `(style|format|language|naming)[:=]`

Rejects:
- Questions (ending with ?)
- Lines > 200 chars
- Max 1 preference per user block
- Deduplicated against session goals