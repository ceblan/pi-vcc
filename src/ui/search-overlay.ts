import { fuzzyFilter, Key, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { TUI } from "@mariozechner/pi-tui";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { FormattedSearchResult, FormattedSessionRow } from "../core/format-search";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OVERLAY_WIDTH = 100;
const MAX_VISIBLE_ROWS = 10;

// ---------------------------------------------------------------------------
// ANSI helpers (same pattern as pi-token-burden/src/report-view.ts)
// ---------------------------------------------------------------------------

function sgr(code: string, text: string): string {
  if (!code) return text;
  return `\u001B[${code}m${text}\u001B[0m`;
}

function bold(text: string): string {
  return `\u001B[1m${text}\u001B[22m`;
}

function dim(text: string): string {
  return `\u001B[2m${text}\u001B[22m`;
}

function italic(text: string): string {
  return `\u001B[3m${text}\u001B[23m`;
}

function cyan(text: string): string {
  return sgr("36", text);
}

function yellow(text: string): string {
  return sgr("33", text);
}

function green(text: string): string {
  return sgr("32", text);
}

// ---------------------------------------------------------------------------
// Row rendering helpers (exact pattern from report-view.ts lines 136-163)
// ---------------------------------------------------------------------------

function makeRow(innerW: number): (content: string) => string {
  return (content: string): string =>
    `${dim("│")}${truncateToWidth(` ${content}`, innerW, "…", true)}${dim("│")}`;
}

function makeEmptyRow(innerW: number): () => string {
  return (): string => `${dim("│")}${" ".repeat(innerW)}${dim("│")}`;
}

function makeDivider(innerW: number): () => string {
  return (): string => dim(`├${"─".repeat(innerW)}┤`);
}

function makeCenterRow(innerW: number): (content: string) => string {
  return (content: string): string => {
    const vis = visibleWidth(content);
    const padding = Math.max(0, innerW - vis);
    const left = Math.floor(padding / 2);
    return `${dim("│")}${" ".repeat(left)}${content}${" ".repeat(padding - left)}${dim("│")}`;
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverlayResult =
  | { kind: "inject"; row: FormattedSessionRow }
  | { kind: "view"; row: FormattedSessionRow }
  | null;

type FlatItem =
  | { kind: "project-header"; project: string; sessionCount: number }
  | { kind: "session-row"; row: FormattedSessionRow; project: string };

interface OverlayState {
  selectedIndex: number;
  scrollOffset: number;
  searchActive: boolean;
  searchQuery: string;
}

// ---------------------------------------------------------------------------
// VccSearchOverlay class
// ---------------------------------------------------------------------------

class VccSearchOverlay {
  private state: OverlayState = { selectedIndex: 0, scrollOffset: 0, searchActive: false, searchQuery: "" };
  private cachedWidth?: number;
  private cachedLines?: string[];
  private flatItems: FlatItem[];

  constructor(
    private tui: TUI,
    private result: FormattedSearchResult,
    private done: (result: OverlayResult) => void,
  ) {
    this.flatItems = this.buildFlatItems();
    // Advance past any leading project-headers to find first selectable row
    this.state.selectedIndex = this.findFirstSessionRow(0, 1);
  }

  private buildFlatItems(): FlatItem[] {
    const items: FlatItem[] = [];
    for (const group of this.result.projects) {
      items.push({
        kind: "project-header",
        project: group.project,
        sessionCount: group.sessions.length,
      });
      for (const row of group.sessions) {
        items.push({ kind: "session-row", row, project: group.project });
      }
    }
    return items;
  }

  /** Find the index of the first session-row starting at `start`, scanning in direction `dir` (+1 or -1).
   *  Returns `start` if no session-row found (safety fallback). */
  private findFirstSessionRow(start: number, dir: 1 | -1): number {
    let i = start;
    while (i >= 0 && i < this.flatItems.length) {
      if (this.flatItems[i].kind === "session-row") return i;
      i += dir;
    }
    return start;
  }

  // -------------------------------------------------------------------------
  // Input handling
  // -------------------------------------------------------------------------

  handleInput(data: string): void {
    // When search is active, delegate to search handler
    if (this.state.searchActive) {
      this.handleSearchInput(data);
      return;
    }

    if (matchesKey(data, "escape")) {
      this.done(null);
      return;
    }
    if (matchesKey(data, "up")) {
      this.moveSelection(-1);
      return;
    }
    if (matchesKey(data, "down")) {
      this.moveSelection(1);
      return;
    }
    if (matchesKey(data, Key.alt("o")) || data === "o") {
      this.selectCurrent("inject");
      return;
    }
    if (matchesKey(data, Key.alt("p")) || data === "p") {
      this.selectCurrent("view");
      return;
    }
    if (data === "/") {
      this.state.searchActive = true;
      this.state.searchQuery = "";
      this.state.selectedIndex = 0;
      this.state.scrollOffset = 0;
      this.invalidate();
    }
  }

  private handleSearchInput(data: string): void {
    // Escape exits search mode
    if (matchesKey(data, "escape")) {
      this.state.searchActive = false;
      this.state.searchQuery = "";
      this.state.selectedIndex = this.findFirstSessionRow(0, 1);
      this.state.scrollOffset = 0;
      this.invalidate();
      return;
    }

    // Navigation still works during search
    if (matchesKey(data, "up")) {
      this.moveSelection(-1);
      return;
    }
    if (matchesKey(data, "down")) {
      this.moveSelection(1);
      return;
    }

    // Alt+o and Alt+p work during search
    if (matchesKey(data, Key.alt("o"))) {
      this.selectCurrent("inject");
      return;
    }
    if (matchesKey(data, Key.alt("p"))) {
      this.selectCurrent("view");
      return;
    }

    // Backspace deletes last char
    if (matchesKey(data, "backspace")) {
      if (this.state.searchQuery.length > 0) {
        this.state.searchQuery = this.state.searchQuery.slice(0, -1);
        this.state.selectedIndex = 0;
        this.state.scrollOffset = 0;
        this.invalidate();
      }
      return;
    }

    // Printable character → append to query
    if (data.length === 1 && (data.codePointAt(0) ?? 0) >= 32) {
      this.state.searchQuery += data;
      this.state.selectedIndex = 0;
      this.state.scrollOffset = 0;
      this.invalidate();
    }
  }

  private getVisibleItems(): FlatItem[] {
    if (!this.state.searchActive || !this.state.searchQuery.trim()) {
      return this.flatItems;
    }
    const sessionItems = this.flatItems.filter(
      (item): item is FlatItem & { kind: "session-row" } => item.kind === "session-row",
    );
    return fuzzyFilter(sessionItems, this.state.searchQuery, (item) =>
      `${item.row.prompt} ${item.row.date} ${item.row.sessionId} ${item.project}`,
    );
  }

  private moveSelection(delta: number): void {
    const visible = this.getVisibleItems();
    const dir = delta > 0 ? 1 : -1;
    let next = this.state.selectedIndex + dir;

    // Skip project-headers (only present when search is inactive)
    while (next >= 0 && next < visible.length && visible[next].kind === "project-header") {
      next += dir;
    }

    // Boundary check: no wrap past edges
    if (next < 0 || next >= visible.length) return;

    this.state.selectedIndex = next;

    // Adjust scroll to keep selection visible
    if (next < this.state.scrollOffset) {
      this.state.scrollOffset = next;
    } else if (next >= this.state.scrollOffset + MAX_VISIBLE_ROWS) {
      this.state.scrollOffset = next - MAX_VISIBLE_ROWS + 1;
    }

    this.invalidate();
  }

  private selectCurrent(kind: "inject" | "view"): void {
    const visible = this.getVisibleItems();
    const item = visible[this.state.selectedIndex];
    if (!item || item.kind !== "session-row") return;
    this.done({ kind, row: item.row });
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const w = Math.min(width, OVERLAY_WIDTH);
    const innerW = w - 2;
    const row = makeRow(innerW);
    const emptyRow = makeEmptyRow(innerW);
    const divider = makeDivider(innerW);
    const centerRow = makeCenterRow(innerW);

    const lines: string[] = [];

    // Top border with title
    const titleText = " VCC Search ";
    const borderLen = innerW - visibleWidth(titleText);
    const leftBorder = Math.floor(borderLen / 2);
    const rightBorder = borderLen - leftBorder;
    lines.push(dim(`╭${"─".repeat(leftBorder)}${titleText}${"─".repeat(rightBorder)}╮`));

    lines.push(emptyRow());
    lines.push(row(this.result.header));
    lines.push(emptyRow());
    lines.push(divider());
    lines.push(emptyRow());

    // Search bar (only when active)
    if (this.state.searchActive) {
      const cursor = sgr("36", "│");
      const query = this.state.searchQuery
        ? `${this.state.searchQuery}${cursor}`
        : `${cursor}${dim(italic("type to filter..."))}`;
      lines.push(row(`${dim("◎")}  ${query}`));
      lines.push(emptyRow());
    }

    // Items
    const visible = this.getVisibleItems();

    if (visible.length === 0) {
      const msg = this.state.searchActive ? "No matching sessions" : "No results";
      lines.push(centerRow(dim(italic(msg))));
      lines.push(emptyRow());
    } else {
      const startIdx = this.state.scrollOffset;
      const endIdx = Math.min(startIdx + MAX_VISIBLE_ROWS, visible.length);

      for (let i = startIdx; i < endIdx; i++) {
        const item = visible[i];

        if (item.kind === "project-header") {
          // Project header — yellow bold, stands out
          const projectName = bold(yellow(item.project));
          const sessionCount = dim(`(${item.sessionCount} session${item.sessionCount !== 1 ? "s" : ""})`);
          lines.push(row(`${projectName}  ${sessionCount}`));
          lines.push(emptyRow());
        } else {
          // Session row — 2 lines
          const isSelected = i === this.state.selectedIndex;
          const prefix = isSelected ? cyan("▸") : dim("·");

          const dateStr = isSelected ? bold(cyan(item.row.date)) : item.row.date;
          const idStr = isSelected ? cyan(item.row.sessionId) : dim(item.row.sessionId);
          const matchStr = isSelected
            ? green(`${item.row.matchCount} match${item.row.matchCount !== 1 ? "es" : ""}`)
            : dim(`${item.row.matchCount} match${item.row.matchCount !== 1 ? "es" : ""}`);

          const line1Content = `${prefix} ${dateStr}  ${idStr}  ${matchStr}`;

          lines.push(row(line1Content));

          // Prompt line — italic dim, distinct from session info
          const promptText = item.row.prompt || "(no prompt)";
          const promptLine = isSelected
            ? italic(`   ${truncateToWidth(promptText, innerW - 5, "…")}`)
            : dim(italic(`   ${truncateToWidth(promptText, innerW - 5, "…")}`));
          lines.push(row(promptLine));
          lines.push(emptyRow());
        }
      }

      // Scroll indicator
      if (visible.length > MAX_VISIBLE_ROWS) {
        const sessionItems = visible.filter((it) => it.kind === "session-row");
        const selectedSessionIdx = sessionItems.findIndex(
          (it) => it.kind === "session-row" && visible[this.state.selectedIndex] === it,
        );
        const countStr = `${selectedSessionIdx + 1}/${sessionItems.length}`;
        lines.push(row(dim(countStr)));
        lines.push(emptyRow());
      }
    }

    // Footer
    lines.push(divider());
    lines.push(emptyRow());
    const footerText = this.state.searchActive
      ? `${italic("type to filter")}  ${italic("↑↓")} navigate  ${italic("alt+o")} inject  ${italic("alt+p")} view  ${italic("esc")} exit search`
      : `${italic("↑↓")} navigate  ${italic("/")} search  ${italic("o")} compress+inject  ${italic("p")} view in browser  ${italic("esc")} close`;
    lines.push(centerRow(dim(footerText)));
    lines.push(dim(`╰${"─".repeat(innerW)}╯`));

    this.cachedLines = lines;
    this.cachedWidth = width;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// @lat: [[hooks-commands-tools#Hooks, Commands, and Tools#UI: search-overlay.ts]]
export async function showSearchOverlay(
  result: FormattedSearchResult,
  ctx: ExtensionCommandContext,
): Promise<OverlayResult> {
  return ctx.ui.custom<OverlayResult>(
    (tui, _theme, _kb, done) => {
      const overlay = new VccSearchOverlay(tui, result, done);
      return {
        render: (w: number) => overlay.render(w),
        invalidate: () => overlay.invalidate(),
        handleInput: (data: string) => {
          overlay.handleInput(data);
          tui.requestRender();
        },
      };
    },
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: OVERLAY_WIDTH },
    },
  );
}
