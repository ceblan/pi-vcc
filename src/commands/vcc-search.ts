import { writeFileSync } from "fs";
import { join } from "path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { findSessions } from "../core/session-finder";
import { rgSearch, extractSessionIdFromPath } from "../core/rg-search";
import { formatSearchOutput, formatSearchResultText } from "../core/format-search";
import { compile } from "../core/summarize";
import { loadAllMessages } from "../core/load-messages";
import { showSearchOverlay } from "../ui/search-overlay";
import type { OverlayResult } from "../ui/search-overlay";
import { openSessionInBrowser } from "../core/open-browser";

const DEFAULT_MAX_RESULTS = 200;
const DEFAULT_MAX_PER_SESSION = 5;
const DEFAULT_PAGE_SIZE = 200;

interface ParsedArgs {
  query: string;
  scope?: "project" | "all";
  page?: number;
  maxResults?: number;
  maxPerSession?: number;
}

const parseArgs = (args: string): ParsedArgs => {
  const result: ParsedArgs = { query: "" };

  // Parse inline page:N from the raw args string before splitting
  const pageMatch = args.match(/\bpage:(\d+)\b/i);
  const page = pageMatch ? Math.max(1, parseInt(pageMatch[1], 10)) : undefined;
  const cleaned = args.replace(/\bpage:\d+\b/i, "").trim();

  // Split cleaned by whitespace
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const queryParts: string[] = [];
  let i = 0;

  while (i < parts.length) {
    const part = parts[i];
    if (part === "--scope" && parts[i + 1]) {
      result.scope = parts[i + 1] as "project" | "all";
      i += 2;
    } else if (part === "--page" && parts[i + 1]) {
      result.page = Math.max(1, parseInt(parts[i + 1], 10));
      i += 2;
    } else if (part === "--max-results" && parts[i + 1]) {
      result.maxResults = parseInt(parts[i + 1], 10);
      i += 2;
    } else if (part === "--max-per-session" && parts[i + 1]) {
      result.maxPerSession = parseInt(parts[i + 1], 10);
      i += 2;
    } else {
      queryParts.push(part);
      i++;
    }
  }

  // If page was parsed from inline syntax and not set via --page, use it
  if (page !== undefined && result.page === undefined) result.page = page;

  result.query = queryParts.join(" ");
  return result;
};

// @lat: [[hooks-commands-tools#Hooks, Commands, and Tools#Command: vcc-search.ts]]
export const registerVccSearchCommand = (pi: ExtensionAPI) => {
  pi.registerCommand("vcc-search", {
    description: "Search across all sessions. Usage: /vcc-search <query> [--scope project] [--page N]",
    async handler(args: string, ctx) {
      // 1. Parse arguments
      const parsed = parseArgs(args);
      if (!parsed.query) {
        ctx.ui.notify("Usage: /vcc-search <query> [--scope all|project] [--page N]", "error");
        return;
      }

      // 2. Find sessions
      let sessionInfos;
      try {
        sessionInfos = await findSessions({
          scope: parsed.scope || "all",
          cwd: ctx.cwd,
          maxSessions: 200,
        });
      } catch (err: any) {
        ctx.ui.notify(`Error: ${err.message}`, "error");
        return;
      }

      if (sessionInfos.length === 0) {
        pi.sendMessage(
          { customType: "vcc-search", content: "No sessions found.", display: true },
          { triggerTurn: true },
        );
        return;
      }

      // 3. Search
      const rgResult = rgSearch(
        sessionInfos.map((s) => s.path),
        parsed.query,
        {
          maxResultsPerSession: parsed.maxPerSession ?? DEFAULT_MAX_PER_SESSION,
          maxTotalResults: DEFAULT_MAX_RESULTS,
        },
      );

      if (rgResult.error) {
        ctx.ui.notify(rgResult.error, "error");
        return;
      }

      // 4. Build session info map
      const sessionInfoMap = new Map(
        sessionInfos.map((s) => [extractSessionIdFromPath(s.path), s]),
      );

      // 5. Format (no pagination for overlay — scroll handles it)
      const formatted = formatSearchOutput(rgResult.matches, sessionInfoMap, parsed.query, {
        totalMatches: rgResult.totalMatches,
      });

      if (ctx.hasUI) {
        // Interactive overlay path
        const selected: OverlayResult = await showSearchOverlay(formatted, ctx);
        if (!selected) return; // User closed with Esc

        if (selected.kind === "view") {
          try {
            ctx.ui.notify("Opening session in browser…", "info");
            await openSessionInBrowser(selected.row);
            ctx.ui.notify(`Opened session ${selected.row.sessionId} in browser`, "info");
          } catch (err: any) {
            ctx.ui.notify(`Error opening browser: ${err.message}`, "error");
          }
          return;
        }

        // selected.kind === "inject"
        // 1. Load raw messages from the selected session
        const { rawMessages } = loadAllMessages(selected.row.path, false);

        // 2. Compile summary
        let summary: string;
        try {
          ctx.ui.notify("Compressing session…", "info");
          summary = compile({ messages: rawMessages });
        } catch (err: any) {
          ctx.ui.notify(`Error compiling session: ${err.message}`, "error");
          return;
        }

        // 3. Write vcc.md
        const vccPath = join(ctx.cwd, "vcc.md");
        writeFileSync(vccPath, summary);

        // 4. Inject into conversation
        const content = `[VCC Context from session ${selected.row.fullSessionId}]\n\n${summary}`;
        pi.sendMessage(
          { customType: "vcc-context", content, display: true },
          { triggerTurn: true },
        );

        ctx.ui.notify(`Compressed session ${selected.row.sessionId} → vcc.md`, "info");
      } else {
        // Text-only fallback (existing behavior)
        const output = formatSearchResultText(formatted);
        pi.sendMessage(
          { customType: "vcc-search", content: output, display: true },
          { triggerTurn: true },
        );
      }
    },
  });
};
