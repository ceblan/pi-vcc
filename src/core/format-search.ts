import type { RgMatch } from "./rg-search";
import type { SessionInfo } from "@mariozechner/pi-coding-agent";
import type { RenderedEntry } from "./render-entries";

/** A session row in the project-grouped output table */
export interface FormattedSessionRow {
  /** Session date (YYYY-MM-DD HH:MM) */
  date: string;
  /** Short session ID (first 8 chars) */
  sessionId: string;
  /** Full session ID for expand references */
  fullSessionId: string;
  /** Path to the session JSONL file */
  path: string;
  /** First user message (the session prompt), truncated */
  prompt: string;
  /** Number of rg matches found in this session */
  matchCount: number;
  /** Match entry indices for expand references */
  matchEntries: number[];
}

/** Sessions grouped by project (cwd) */
export interface FormattedProjectGroup {
  /** Project working directory */
  project: string;
  /** Session rows within this project */
  sessions: FormattedSessionRow[];
}

/** Complete formatted search result */
export interface FormattedSearchResult {
  /** Header line like 'Found 8 matches for "auth" across 3 sessions:' */
  header: string;
  /** Sessions grouped by project */
  projects: FormattedProjectGroup[];
  /** Pagination footer (empty string if no more pages) */
  footer: string;
}

/**
 * Take ripgrep matches + session info and produce formatted output grouped by project.
 * Each session appears once with its prompt (firstMessage), grouped under its project (cwd).
 */
// @lat: [[core#Core Modules#format-search.ts]]
export const formatSearchOutput = (
  matches: RgMatch[],
  sessionInfos: Map<string, SessionInfo>,
  query: string,
  options?: {
    maxPerSession?: number;
    page?: number;
    pageSize?: number;
    totalMatches?: number;
  },
): FormattedSearchResult => {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 10;

  // Group matches by sessionId
  const matchesBySession = new Map<string, RgMatch[]>();
  for (const match of matches) {
    const existing = matchesBySession.get(match.sessionId) || [];
    existing.push(match);
    matchesBySession.set(match.sessionId, existing);
  }

  // Build session rows, grouped by project (cwd)
  const projectMap = new Map<string, FormattedSessionRow[]>();
  for (const [sessionId, sessionMatches] of matchesBySession) {
    const info = sessionInfos.get(sessionId);
    if (!info) continue;

    const project = info.cwd || "(unknown)";
    const rows = projectMap.get(project) || [];

    rows.push({
      date: formatSessionDate(info.created),
      sessionId: sessionId.slice(0, 8),
      fullSessionId: sessionId,
      path: info.path,
      prompt: truncateText(info.firstMessage.replace(/\n/g, " "), 120),
      matchCount: sessionMatches.length,
      matchEntries: sessionMatches.map((m) => m.entryIndex),
    });

    projectMap.set(project, rows);
  }

  // Sort sessions within each project by date descending
  const projects: FormattedProjectGroup[] = [];
  for (const [project, rows] of projectMap) {
    rows.sort((a, b) => b.date.localeCompare(a.date));
    projects.push({ project, sessions: rows });
  }

  // Sort projects alphabetically
  projects.sort((a, b) => a.project.localeCompare(b.project));

  const totalSessions = [...matchesBySession.keys()].length;

  // Build header
  const header =
    matches.length === 0
      ? `No matches for "${query}" in session history.`
      : `Found ${matches.length} match${matches.length !== 1 ? "es" : ""} for "${query}" across ${totalSessions} session${totalSessions !== 1 ? "s" : ""} in ${projects.length} project${projects.length !== 1 ? "s" : ""}:`;

  // Build footer
  const total = options?.totalMatches ?? matches.length;
  const totalPages = Math.ceil(total / pageSize);
  const footer = page < totalPages ? `--- Use page:${page + 1} for more results ---` : "";

  return { header, projects, footer };
};

/**
 * Convert a FormattedSearchResult into the final text output.
 * Groups sessions by project in a table format.
 */
export const formatSearchResultText = (result: FormattedSearchResult): string => {
  const parts: string[] = [result.header];

  for (const group of result.projects) {
    parts.push("");
    parts.push(`## Project: ${group.project}`);
    parts.push("");
    parts.push("| Date | Session ID | Matches | Prompt |");
    parts.push("|------|-----------|---------|--------|");

    for (const row of group.sessions) {
      const escapedPrompt = row.prompt.replace(/\|/g, "\\|");
      const matchInfo = row.matchEntries.length <= 3
        ? row.matchEntries.map((e) => `#${e}`).join(", ")
        : `${row.matchEntries.slice(0, 3).map((e) => `#${e}`).join(", ")} +${row.matchEntries.length - 3} more`;
      parts.push(
        `| ${row.date} | ${row.fullSessionId} | ${matchInfo} | ${escapedPrompt} |`,
      );
    }
  }

  if (result.footer) {
    parts.push("");
    parts.push(result.footer);
  }

  return parts.join("\n").trimEnd();
};

/** Truncate text to maxLen characters, appending "..." if needed */
const truncateText = (text: string, maxLen: number): string => {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
};

/** Format a Date as YYYY-MM-DD HH:MM */
const formatSessionDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
};

export const formatExpandedSearchOutput = (
  entries: Array<{ sessionId: string; entry: RenderedEntry }>,
  errors?: string[],
): string => {
  if (entries.length === 0 && (!errors?.length)) {
    return "No entries found for the given expand parameters.";
  }

  if (entries.length === 0) {
    return `No entries expanded:\n${errors!.join("\n")}`;
  }

  // Group by session
  const bySession = new Map<string, RenderedEntry[]>();
  for (const { sessionId, entry } of entries) {
    const existing = bySession.get(sessionId) || [];
    existing.push(entry);
    bySession.set(sessionId, existing);
  }

  const parts: string[] = [];
  parts.push(`Expanded ${entries.length} entr${entries.length !== 1 ? "ies" : "y"} from ${bySession.size} session${bySession.size !== 1 ? "s" : ""}:`);

  for (const [sessionId, sessionEntries] of bySession) {
    parts.push("");
    parts.push(`### Session: ${sessionId}`);
    for (const entry of sessionEntries) {
      parts.push(`#${entry.index} [${entry.role}] ${entry.summary}`);
    }
  }

  if (errors?.length) {
    parts.push("");
    parts.push("---");
    parts.push("Warnings:");
    parts.push(...errors);
  }

  return parts.join("\n");
};
