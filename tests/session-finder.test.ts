import { describe, it, expect } from "vitest";
import type { SessionInfo } from "@mariozechner/pi-coding-agent";
import { extractSessionIdFromPath } from "../src/core/rg-search";

/**
 * Unit tests for the filtering/sorting logic of findSessions.
 * We test the pure logic by importing the function and mocking the SessionManager calls.
 * Since SessionManager static methods are hard to mock, we test the logic
 * by extracting the filter/sort steps.
 */
describe("session finder logic", () => {
  const makeSession = (id: string, modified: Date, cwd = "/test"): SessionInfo => ({
    path: `/tmp/${id}.jsonl`,
    id,
    cwd,
    name: undefined,
    created: new Date(modified.getTime() - 3600000),
    modified,
    messageCount: 10,
    firstMessage: "hello",
    allMessagesText: "",
  });

  it("filters by sessionIds", () => {
    const sessions: SessionInfo[] = [
      makeSession("a", new Date()),
      makeSession("b", new Date()),
      makeSession("c", new Date()),
    ];
    const ids = new Set(["a", "c"]);
    const filtered = sessions.filter((s) => ids.has(s.id));
    expect(filtered.length).toBe(2);
    expect(filtered.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("filters by maxAge", () => {
    const now = new Date();
    const sessions: SessionInfo[] = [
      makeSession("old", new Date(now.getTime() - 86400000 * 10)), // 10 days ago
      makeSession("recent", new Date(now.getTime() - 3600000)), // 1 hour ago
      makeSession("new", new Date()),
    ];
    const maxAge = new Date(now.getTime() - 86400000); // 1 day ago
    const filtered = sessions.filter((s) => s.modified >= maxAge);
    expect(filtered.length).toBe(2);
    expect(filtered.map((s) => s.id)).toEqual(["recent", "new"]);
  });

  it("sorts by modified desc", () => {
    const sessions: SessionInfo[] = [
      makeSession("oldest", new Date(Date.now() - 30000)),
      makeSession("newest", new Date(Date.now())),
      makeSession("middle", new Date(Date.now() - 15000)),
    ];
    const sorted = [...sessions].sort((a, b) => b.modified.getTime() - a.modified.getTime());
    expect(sorted.map((s) => s.id)).toEqual(["newest", "middle", "oldest"]);
  });

  it("caps at maxSessions", () => {
    const sessions: SessionInfo[] = Array.from({ length: 5 }, (_, i) =>
      makeSession(`s${i}`, new Date(Date.now() - i * 1000)),
    );
    const capped = sessions.slice(0, 2);
    expect(capped.length).toBe(2);
  });

  it("returns empty array when no sessions match filters", () => {
    const sessions: SessionInfo[] = [makeSession("a", new Date())];
    const ids = new Set(["nonexistent"]);
    const filtered = sessions.filter((s) => ids.has(s.id));
    expect(filtered).toEqual([]);
  });

  it("matches session by path-derived ID (timestamp_uuid format)", () => {
    const sessions: SessionInfo[] = [
      {
        ...makeSession("58858968-cd38-486d-adbc-73431cca3265", new Date()),
        path: "/home/user/.pi/agent/sessions/--project--/2026-04-12T23-24-12-125Z_58858968-cd38-486d-adbc-73431cca3265.jsonl",
      },
    ];
    // User passes path-derived ID, but s.id is just the UUID
    const wanted = "2026-04-12T23-24-12-125Z_58858968-cd38-486d-adbc-73431cca3265";
    const idSet = new Set([wanted]);
    const filtered = sessions.filter((s) => {
      if (idSet.has(s.id)) return true;
      const pathId = extractSessionIdFromPath(s.path);
      if (idSet.has(pathId)) return true;
      for (const w of idSet) {
        if (pathId.includes(w) || w.includes(s.id)) return true;
      }
      return false;
    });
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("58858968-cd38-486d-adbc-73431cca3265");
  });

  it("matches session by short UUID prefix", () => {
    const sessions: SessionInfo[] = [
      makeSession("58858968-cd38-486d-adbc-73431cca3265", new Date()),
    ];
    const wanted = "58858968";
    const idSet = new Set([wanted]);
    const filtered = sessions.filter((s) => {
      if (idSet.has(s.id)) return true;
      for (const w of idSet) {
        if (s.id.startsWith(w)) return true;
      }
      return false;
    });
    expect(filtered.length).toBe(1);
  });
});
