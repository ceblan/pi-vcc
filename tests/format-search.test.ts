import { describe, it, expect } from "vitest";
import {
  formatSearchOutput,
  formatSearchResultText,
  formatExpandedSearchOutput,
} from "../src/core/format-search";
import type { RgMatch } from "../src/core/rg-search";
import type { SessionInfo } from "@mariozechner/pi-coding-agent";
import type { RenderedEntry } from "../src/core/render-entries";

const makeSessionInfo = (id: string, overrides?: Partial<SessionInfo>): SessionInfo => ({
  path: `/tmp/${id}.jsonl`,
  id,
  cwd: "/home/user/project",
  name: `Session ${id}`,
  created: new Date("2026-04-19T10:30:00Z"),
  modified: new Date(),
  messageCount: 47,
  firstMessage: "Hello, fix the auth bug",
  allMessagesText: "",
  ...overrides,
});

const makeMatch = (
  sessionId: string,
  entryIndex: number,
  role: string,
  content: string,
): RgMatch => ({
  sessionPath: `/tmp/${sessionId}.jsonl`,
  sessionId,
  entryIndex,
  lineNumber: entryIndex + 1,
  text: JSON.stringify({
    type: "message",
    id: `m${entryIndex}`,
    parentId: "",
    message: { role, content },
  }),
  matchStart: 0,
  matchEnd: 0,
});

describe("formatSearchOutput", () => {
  it("formats header with match count and project count", () => {
    const matches = [
      makeMatch("sess-a", 0, "user", "Fix auth bug"),
      makeMatch("sess-a", 1, "assistant", "Looking at auth"),
      makeMatch("sess-b", 0, "user", "Auth token issue"),
    ];
    const sessionInfos = new Map([
      ["sess-a", makeSessionInfo("sess-a")],
      ["sess-b", makeSessionInfo("sess-b")],
    ]);
    const result = formatSearchOutput(matches, sessionInfos, "auth");
    expect(result.header).toContain("Found 3 matches");
    expect(result.header).toContain("auth");
    expect(result.header).toContain("2 sessions");
    expect(result.header).toContain("1 project");
  });

  it("formats no-matches header", () => {
    const result = formatSearchOutput([], new Map(), "auth");
    expect(result.header).toContain("No matches for");
    expect(result.header).toContain("auth");
  });

  it("groups sessions by project (cwd)", () => {
    const matches = [
      makeMatch("sess-a", 0, "user", "hello"),
      makeMatch("sess-b", 0, "user", "foo"),
      makeMatch("sess-c", 0, "user", "bar"),
    ];
    const sessionInfos = new Map([
      ["sess-a", makeSessionInfo("sess-a", { cwd: "/home/user/project-alpha" })],
      ["sess-b", makeSessionInfo("sess-b", { cwd: "/home/user/project-beta" })],
      ["sess-c", makeSessionInfo("sess-c", { cwd: "/home/user/project-alpha" })],
    ]);
    const result = formatSearchOutput(matches, sessionInfos, "test");
    expect(result.projects.length).toBe(2);

    const alpha = result.projects.find((p) => p.project === "/home/user/project-alpha");
    const beta = result.projects.find((p) => p.project === "/home/user/project-beta");
    expect(alpha?.sessions.length).toBe(2);
    expect(beta?.sessions.length).toBe(1);
  });

  it("includes session date, id, path, and prompt", () => {
    const matches = [makeMatch("sess-a", 0, "user", "hello")];
    const sessionInfos = new Map([
      ["sess-a", makeSessionInfo("sess-a", {
        firstMessage: "Fix the authentication bug in login",
        created: new Date("2026-04-19T14:30:00Z"),
      })],
    ]);
    const result = formatSearchOutput(matches, sessionInfos, "test");
    const row = result.projects[0].sessions[0];
    expect(row.date).toContain("2026-04-19");
    expect(row.sessionId).toBe("sess-a".slice(0, 8));
    expect(row.path).toBe("/tmp/sess-a.jsonl");
    expect(row.prompt).toContain("Fix the authentication bug");
  });

  it("tracks match count and entry indices per session", () => {
    const matches = [
      makeMatch("sess-a", 3, "user", "a"),
      makeMatch("sess-a", 7, "assistant", "b"),
      makeMatch("sess-a", 12, "user", "c"),
    ];
    const sessionInfos = new Map([["sess-a", makeSessionInfo("sess-a")]]);
    const result = formatSearchOutput(matches, sessionInfos, "test");
    const row = result.projects[0].sessions[0];
    expect(row.matchCount).toBe(3);
    expect(row.matchEntries).toEqual([3, 7, 12]);
  });

  it("truncates long prompts", () => {
    const longPrompt = "x".repeat(200);
    const matches = [makeMatch("sess-a", 0, "user", "hello")];
    const sessionInfos = new Map([
      ["sess-a", makeSessionInfo("sess-a", { firstMessage: longPrompt })],
    ]);
    const result = formatSearchOutput(matches, sessionInfos, "test");
    expect(result.projects[0].sessions[0].prompt.length).toBeLessThanOrEqual(123);
  });

  it("shows pagination footer", () => {
    const matches = [makeMatch("sess-a", 0, "user", "a")];
    const sessionInfos = new Map([["sess-a", makeSessionInfo("sess-a")]]);
    const result = formatSearchOutput(matches, sessionInfos, "test", {
      page: 1,
      pageSize: 10,
      totalMatches: 15,
    });
    expect(result.footer).toContain("page:2");
  });

  it("hides footer on last page", () => {
    const matches = [makeMatch("sess-a", 0, "user", "a")];
    const sessionInfos = new Map([["sess-a", makeSessionInfo("sess-a")]]);
    const result = formatSearchOutput(matches, sessionInfos, "test", {
      page: 1,
      pageSize: 10,
      totalMatches: 5,
    });
    expect(result.footer).toBe("");
  });

  it("skips unknown sessions", () => {
    const matches = [makeMatch("sess-unknown", 0, "user", "hello")];
    const result = formatSearchOutput(matches, new Map(), "test");
    expect(result.projects.length).toBe(0);
  });

  it("sorts sessions within project by date descending", () => {
    const matches = [
      makeMatch("sess-old", 0, "user", "old"),
      makeMatch("sess-new", 0, "user", "new"),
    ];
    const sessionInfos = new Map([
      ["sess-old", makeSessionInfo("sess-old", { created: new Date("2026-04-10T10:00:00Z") })],
      ["sess-new", makeSessionInfo("sess-new", { created: new Date("2026-04-19T10:00:00Z") })],
    ]);
    const result = formatSearchOutput(matches, sessionInfos, "test");
    expect(result.projects[0].sessions[0].date).toContain("2026-04-19");
    expect(result.projects[0].sessions[1].date).toContain("2026-04-10");
  });

  it("sorts projects alphabetically", () => {
    const matches = [
      makeMatch("sess-a", 0, "user", "a"),
      makeMatch("sess-b", 0, "user", "b"),
    ];
    const sessionInfos = new Map([
      ["sess-a", makeSessionInfo("sess-a", { cwd: "/home/user/zebra" })],
      ["sess-b", makeSessionInfo("sess-b", { cwd: "/home/user/alpha" })],
    ]);
    const result = formatSearchOutput(matches, sessionInfos, "test");
    expect(result.projects[0].project).toBe("/home/user/alpha");
    expect(result.projects[1].project).toBe("/home/user/zebra");
  });
});

describe("formatSearchResultText", () => {
  it("produces markdown table grouped by project with full session ID and matches", () => {
    const matches = [
      makeMatch("sess-a", 3, "user", "Fix the auth bug"),
      makeMatch("sess-a", 5, "assistant", "Root cause found"),
      makeMatch("sess-b", 0, "user", "Deploy to staging"),
    ];
    const sessionInfos = new Map([
      ["sess-a", makeSessionInfo("sess-a", {
        cwd: "/home/user/project-a",
        firstMessage: "Fix the auth bug in login",
      })],
      ["sess-b", makeSessionInfo("sess-b", {
        cwd: "/home/user/project-b",
        firstMessage: "Deploy to staging env",
      })],
    ]);
    const formatted = formatSearchOutput(matches, sessionInfos, "auth bug");
    const output = formatSearchResultText(formatted);

    expect(output).toContain('Found 3 matches for "auth bug"');
    expect(output).toContain("## Project: /home/user/project-a");
    expect(output).toContain("## Project: /home/user/project-b");
    expect(output).toContain("| Date | Session ID | Matches | Prompt |");
    // Full session ID shown
    expect(output).toContain("sess-a");
    // Match entry indices shown
    expect(output).toContain("#3");
    expect(output).toContain("#5");
    expect(output).toContain("Fix the auth bug in login");
    expect(output).toContain("Deploy to staging env");
  });

  it("escapes pipe characters in prompts", () => {
    const matches = [makeMatch("sess-a", 0, "user", "hello")];
    const sessionInfos = new Map([
      ["sess-a", makeSessionInfo("sess-a", {
        firstMessage: "Fix auth | token refresh",
      })],
    ]);
    const formatted = formatSearchOutput(matches, sessionInfos, "test");
    const output = formatSearchResultText(formatted);
    expect(output).toContain("Fix auth \\| token refresh");
  });
});

describe("formatExpandedSearchOutput", () => {
  const makeEntry = (index: number, role: string, summary: string): RenderedEntry => ({
    index, role, summary,
  });

  it("formats single session with single entry", () => {
    const result = formatExpandedSearchOutput([
      { sessionId: "sess-abc12345def", entry: makeEntry(142, "user", "Full content here") },
    ]);
    expect(result).toContain("Expanded 1 entry from 1 session:");
    expect(result).toContain("### Session: sess-abc");
    expect(result).toContain("#142 [user] Full content here");
  });

  it("groups entries by session", () => {
    const result = formatExpandedSearchOutput([
      { sessionId: "sess-aaa", entry: makeEntry(1, "user", "Hello") },
      { sessionId: "sess-bbb", entry: makeEntry(2, "assistant", "Hi") },
      { sessionId: "sess-aaa", entry: makeEntry(3, "user", "World") },
    ]);
    expect(result).toContain("Expanded 3 entries from 2 sessions:");
    expect(result).toContain("sess-aaa");
    expect(result).toContain("sess-bbb");
  });

  it("shows empty message when no entries and no errors", () => {
    const result = formatExpandedSearchOutput([]);
    expect(result).toBe("No entries found for the given expand parameters.");
  });

  it("shows errors when no entries expanded", () => {
    const result = formatExpandedSearchOutput([], ["Session not found: xyz"]);
    expect(result).toContain("No entries expanded:");
    expect(result).toContain("Session not found: xyz");
  });

  it("shows warnings alongside successful expansions", () => {
    const result = formatExpandedSearchOutput(
      [{ sessionId: "sess-aaa", entry: makeEntry(1, "user", "Hello") }],
      ["Session not found: xyz"],
    );
    expect(result).toContain("Expanded 1 entry");
    expect(result).toContain("Warnings:");
    expect(result).toContain("Session not found: xyz");
  });

  it("uses singular 'session' for single session", () => {
    const result = formatExpandedSearchOutput([
      { sessionId: "sess-aaa", entry: makeEntry(1, "user", "Hello") },
    ]);
    expect(result).toContain("Expanded 1 entry from 1 session:");
  });

  it("uses plural 'sessions' for multiple sessions", () => {
    const result = formatExpandedSearchOutput([
      { sessionId: "sess-aaa", entry: makeEntry(1, "user", "Hello") },
      { sessionId: "sess-bbb", entry: makeEntry(2, "assistant", "Hi") },
    ]);
    expect(result).toContain("Expanded 2 entries from 2 sessions:");
  });
});
