import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RenderedEntry } from "../core/render-entries";
import { findSessions } from "../core/session-finder";
import { rgSearch, extractSessionIdFromPath } from "../core/rg-search";
import { formatSearchOutput, formatSearchResultText, formatExpandedSearchOutput } from "../core/format-search";
import { loadMessageAtLine } from "../core/load-messages";

const DEFAULT_MAX_RESULTS = 30;
const DEFAULT_MAX_PER_SESSION = 3;
const DEFAULT_PAGE_SIZE = 10;

// @lat: [[hooks-commands-tools#Hooks, Commands, and Tools#Tool: search.ts]]
export const registerSearchTool = (pi: ExtensionAPI) => {
  pi.registerTool({
    name: "vcc_search",
    label: "VCC Search",
    description:
      "Search across multiple sessions from the same project or all sessions." +
      " Use this when you need to find information from previous sessions." +
      " Results show which session each hit came from." +
      " Supports regex patterns (e.g. 'auth|token')." +
      " Use page:N for pagination." +
      " Use expand:[{session,entry}] to get full content of specific entries from search results.",
    promptSnippet:
      "vcc_search: Search across multiple sessions for previous context." +
      " Supports regex. Use scope:all (default) or scope:project." +
      " Use expand:[{session,entry}] for full content.",
    parameters: Type.Object({
      query: Type.String({
        description: "Search terms or regex pattern (e.g. 'auth|token', 'fail.*build')",
      }),
      scope: Type.Optional(
        Type.Union([
          Type.Literal("project"),
          Type.Literal("all"),
        ]),
      ),
      sessions: Type.Optional(
        Type.Array(Type.String(), {
          description: "Specific session IDs to search (limits scope)",
        }),
      ),
      maxResults: Type.Optional(
        Type.Number({
          description: "Maximum total results (default: 30)",
        }),
      ),
      maxPerSession: Type.Optional(
        Type.Number({
          description: "Maximum results per session (default: 3)",
        }),
      ),
      page: Type.Optional(
        Type.Number({
          description: "Page number for pagination (1-based, default: 1)",
        }),
      ),
      expand: Type.Optional(
        Type.Array(
          Type.Object({
            session: Type.String({
              description: "Session ID from search results (full ID or first 8 chars shown in displayIndex)",
            }),
            entry: Type.Number({
              description: "Entry index from search results (the number after # in displayIndex, e.g. 142 from abc12345:#142)",
            }),
          }),
        ),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;

      // Expand-only mode: when expand is provided, skip search entirely
      if (params.expand?.length) {
        // 1. Collect unique session IDs (handle partial IDs)
        const sessionIds = [...new Set(params.expand.map((e) => e.session))];

        // 2. Resolve session IDs to file paths
        const sessionInfos = await findSessions({
          scope: "all",
          cwd,
          sessionIds,
        });

        // Build a lookup map using both s.id and extractSessionIdFromPath(s.path)
        const pathById = new Map<string, string>();
        for (const s of sessionInfos) {
          pathById.set(s.id, s.path);
          const pathId = extractSessionIdFromPath(s.path);
          if (pathId !== s.id) pathById.set(pathId, s.path);
          if (s.id.length > 8) pathById.set(s.id.slice(0, 8), s.path);
          if (pathId.length > 8) pathById.set(pathId.slice(0, 8), s.path);
        }

        // 3. Load and render each requested entry
        const expanded: Array<{ sessionId: string; entry: RenderedEntry }> = [];
        const errors: string[] = [];

        for (const { session, entry } of params.expand) {
          const path = pathById.get(session) ?? pathById.get(session.slice(0, 8));
          if (!path) {
            errors.push(`Session not found: ${session}`);
            continue;
          }
          const rendered = loadMessageAtLine(path, entry + 1);
          if (!rendered) {
            errors.push(`No message at index #${entry} in session ${session}`);
            continue;
          }
          const resolvedId = extractSessionIdFromPath(path);
          expanded.push({ sessionId: resolvedId, entry: rendered });
        }

        if (expanded.length === 0) {
          const errorMsg = errors.length
            ? `No entries expanded:\n${errors.join("\n")}`
            : "No entries found for the given expand parameters.";
          return { content: [{ type: "text", text: errorMsg }], details: undefined };
        }

        // 4. Format output
        const output = formatExpandedSearchOutput(expanded, errors);
        return { content: [{ type: "text", text: output }], details: undefined };
      }

      // 1. Resolve scope and cwd
      const scope = params.scope || "all";

      // 2. Find sessions
      let sessionInfos;
      try {
        sessionInfos = await findSessions({
          scope,
          cwd,
          sessionIds: params.sessions,
          maxSessions: 50,
        });
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error finding sessions: ${err.message}` }],
          details: undefined,
        };
      }

      if (sessionInfos.length === 0) {
        return {
          content: [{ type: "text", text: "No sessions found for the given scope." }],
          details: undefined,
        };
      }

      // 3. Extract file paths for ripgrep
      const sessionPaths = sessionInfos.map((s) => s.path);

      // 4. Run ripgrep search
      const rgResult = rgSearch(sessionPaths, params.query, {
        maxResultsPerSession: params.maxPerSession ?? DEFAULT_MAX_PER_SESSION,
        maxTotalResults: DEFAULT_MAX_RESULTS,
      });

      if (rgResult.error) {
        return {
          content: [{ type: "text", text: rgResult.error }],
          details: undefined,
        };
      }

      if (rgResult.matches.length === 0) {
        return {
          content: [{ type: "text", text: `No matches for "${params.query}" in ${rgResult.sessionsSearched} sessions.` }],
          details: undefined,
        };
      }

      // 5. Build session info map keyed by session ID
      const sessionInfoMap = new Map(
        sessionInfos.map((s) => [extractSessionIdFromPath(s.path), s]),
      );

      // 6. Paginate matches
      const page = Math.max(1, params.page ?? 1);
      const startIdx = (page - 1) * DEFAULT_PAGE_SIZE;
      const pageMatches = rgResult.matches.slice(startIdx, startIdx + DEFAULT_PAGE_SIZE);

      // 7. Format output
      const formatted = formatSearchOutput(pageMatches, sessionInfoMap, params.query, {
        maxPerSession: params.maxPerSession ?? DEFAULT_MAX_PER_SESSION,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
        totalMatches: rgResult.totalMatches,
      });

      const outputText = formatSearchResultText(formatted);

      return {
        content: [{ type: "text", text: outputText }],
        details: undefined,
      };
    },
  });
};
