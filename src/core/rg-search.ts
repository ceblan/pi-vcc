import { execFileSync } from "child_process";
import { existsSync } from "fs";

/** A single match from ripgrep within a session JSONL file */
export interface RgMatch {
  /** Full filesystem path to the .jsonl session file */
  sessionPath: string;
  /** Session ID extracted from the filename (filename without .jsonl extension) */
  sessionId: string;
  /** 0-based entry index within the session (lineNumber - 1) */
  entryIndex: number;
  /** 1-based line number in the JSONL file (from ripgrep) */
  lineNumber: number;
  /** The raw text of the matching JSONL line */
  text: string;
  /** UTF-8 byte offset where the first submatch starts */
  matchStart: number;
  /** UTF-8 byte offset where the first submatch ends */
  matchEnd: number;
}

/** Complete result of a ripgrep search across sessions */
export interface RgSearchResult {
  /** All matches found (may be capped by maxTotalResults) */
  matches: RgMatch[];
  /** Number of session files searched */
  sessionsSearched: number;
  /** Total matches found */
  totalMatches: number;
  /** Error message if search failed, undefined on success */
  error?: string;
}

/** Optional parameters for rgSearch */
export interface RgSearchOptions {
  /** Max results per session file (default: 3) */
  maxResultsPerSession?: number;
  /** Max total results across all sessions (default: 30) */
  maxTotalResults?: number;
}

/**
 * Locate the ripgrep binary on the system.
 * Returns the path string if found, null otherwise.
 */
// @lat: [[core#Core Modules#rg-search.ts]]
export const findRgPath = (): string | null => {
  // Try common paths first
  for (const p of ["/usr/bin/rg", "/usr/local/bin/rg"]) {
    if (existsSync(p)) return p;
  }

  // Fall back to `which rg`
  try {
    const result = execFileSync("which", ["rg"], {
      encoding: "utf-8",
      timeout: 2000,
    }).trim();
    if (result && existsSync(result)) return result;
  } catch {
    // which not found or rg not in PATH
  }

  return null;
};

/**
 * Extract session ID from a session file path.
 * e.g. "/home/user/.pi/sessions/.../2026-04-19T16-36-50Z_abc.jsonl" → "2026-04-19T16-36-50Z_abc"
 */
export const extractSessionIdFromPath = (sessionPath: string): string => {
  return sessionPath.split("/").pop()?.replace(/\.jsonl$/, "") ?? "";
};

/**
 * Execute ripgrep against a list of session file paths, parse JSON output,
 * and return structured match results filtered to message-type entries.
 */
export const rgSearch = (
  sessionPaths: string[],
  query: string,
  options?: RgSearchOptions,
): RgSearchResult => {
  if (!sessionPaths.length) {
    return { matches: [], sessionsSearched: 0, totalMatches: 0 };
  }

  if (!query.trim()) {
    return {
      matches: [],
      sessionsSearched: sessionPaths.length,
      totalMatches: 0,
      error: "Empty query",
    };
  }

  const rgPath = findRgPath();
  if (!rgPath) {
    return {
      matches: [],
      sessionsSearched: 0,
      totalMatches: 0,
      error: "ripgrep (rg) not found. Install: apt install ripgrep or brew install ripgrep",
    };
  }

  const maxPerSession = options?.maxResultsPerSession ?? 3;
  const maxTotal = options?.maxTotalResults ?? 30;

  const args = [
    "--json",
    "--glob", "*.jsonl",
    "--max-count", String(maxPerSession),
    "--",
    query,
    ...sessionPaths,
  ];

  try {
    const output = execFileSync(rgPath, args, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
    });

    const matches: RgMatch[] = [];

    for (const line of output.split("\n")) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line);
        if (parsed.type !== "match" || !parsed.data) continue;

        const text: string = parsed.data.lines?.text?.trimEnd() ?? "";

        // Skip non-message entries (compaction, session header, etc.)
        if (!text.includes('"type":"message"')) continue;

        const sessionPath: string = parsed.data.path?.text ?? "";
        const lineNumber: number = parsed.data.line_number ?? 0;
        const submatches = parsed.data.submatches?.[0];

        matches.push({
          sessionPath,
          sessionId: extractSessionIdFromPath(sessionPath),
          entryIndex: lineNumber - 1,
          lineNumber,
          text,
          matchStart: submatches?.start ?? 0,
          matchEnd: submatches?.end ?? 0,
        });

        if (matches.length >= maxTotal) break;
      } catch {
        // Skip malformed JSON lines
      }
    }

    return { matches, sessionsSearched: sessionPaths.length, totalMatches: matches.length };
  } catch (err: any) {
    if (err.status === 1) {
      // ripgrep exit code 1 = no matches found (not an error)
      return { matches: [], sessionsSearched: sessionPaths.length, totalMatches: 0 };
    }
    if (err.status === 2) {
      return {
        matches: [],
        sessionsSearched: sessionPaths.length,
        totalMatches: 0,
        error: `Invalid regex pattern: ${query}`,
      };
    }
    return {
      matches: [],
      sessionsSearched: sessionPaths.length,
      totalMatches: 0,
      error: `Search failed: ${err.message}`,
    };
  }
};
