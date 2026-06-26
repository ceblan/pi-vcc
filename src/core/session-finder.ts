import { SessionManager, type SessionInfo } from "@earendil-works/pi-coding-agent";
import { extractSessionIdFromPath } from "./rg-search";

/** Options controlling which sessions to discover. */
export interface SessionSearchOptions {
  /** Search scope: "project" limits to sessions from one CWD; "all" searches every project */
  scope: "project" | "all";
  /** Override project directory for scope:"project" (defaults to process.cwd()) */
  cwd?: string;
  /** Override session directory (passed as second arg to SessionManager.list) */
  sessionDir?: string;
  /** If set, only include sessions whose IDs are in this list */
  sessionIds?: string[];
  /** Cap on number of sessions returned (after sorting by modified desc) */
  maxSessions?: number;
  /** If set, exclude sessions modified before this date */
  maxAge?: Date;
}

/**
 * Discover Pi session files using SessionManager.list() / SessionManager.listAll()
 * static methods and return SessionInfo[] with optional filtering/sorting.
 */
// @lat: [[core#Core Modules#session-finder.ts]]
export const findSessions = async (
  options: SessionSearchOptions,
): Promise<SessionInfo[]> => {
  let sessions: SessionInfo[];

  if (options.scope === "all") {
    sessions = await SessionManager.listAll();
  } else {
    const cwd = options.cwd || process.cwd();
    sessions = await SessionManager.list(cwd, options.sessionDir);
  }

  // Filter to specific session IDs if provided (match against s.id, path-derived ID, or prefix)
  if (options.sessionIds?.length) {
    const idSet = new Set(options.sessionIds);
    sessions = sessions.filter((s) => {
      // Direct match on internal ID
      if (idSet.has(s.id)) return true;
      // Match on path-derived ID (timestamp_uuid format)
      const pathId = extractSessionIdFromPath(s.path);
      if (idSet.has(pathId)) return true;
      // Partial prefix match (first 8 chars)
      for (const wanted of idSet) {
        if (s.id.startsWith(wanted) || wanted.startsWith(s.id)) return true;
        if (pathId.startsWith(wanted) || wanted.startsWith(pathId)) return true;
        // Match UUID portion within path ID (after the timestamp_)
        if (pathId.includes(wanted) || wanted.includes(s.id)) return true;
      }
      return false;
    });
  }

  // Filter by age if specified
  if (options.maxAge) {
    sessions = sessions.filter((s) => s.modified >= options.maxAge!);
  }

  // Sort by modified descending
  sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());

  // Cap if requested
  if (options.maxSessions) {
    sessions = sessions.slice(0, options.maxSessions);
  }

  return sessions;
};
