import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rgSearch, findRgPath, extractSessionIdFromPath } from "../src/core/rg-search";

let tmpDir: string;
let session1: string;
let session2: string;
let session3: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "rg-search-test-"));

  session1 = join(tmpDir, "2026-04-19T10-00-00Z_abc123.jsonl");
  session2 = join(tmpDir, "2026-04-19T11-00-00Z_def456.jsonl");
  session3 = join(tmpDir, "2026-04-19T12-00-00Z_ghi789.jsonl");

  // Session 1: contains "auth token" in user message
  writeFileSync(session1, [
    `{"type":"session","version":3,"id":"test-1","timestamp":"2026-04-19T00:00:00Z","cwd":"/test"}`,
    `{"type":"message","id":"m0","parentId":"","message":{"role":"user","content":"Fix the auth token bug"}}`,
    `{"type":"message","id":"m1","parentId":"m0","message":{"role":"assistant","content":[{"type":"text","text":"Looking at auth module"}]}}`,
    `{"type":"message","id":"m2","parentId":"m1","message":{"role":"toolResult","toolName":"read","content":[{"type":"text","text":"auth.ts contents"}]}}`,
  ].join("\n") + "\n");

  // Session 2: contains "auth bug" and "login" in separate messages
  writeFileSync(session2, [
    `{"type":"session","version":3,"id":"test-2","timestamp":"2026-04-19T01:00:00Z","cwd":"/test2"}`,
    `{"type":"message","id":"m0","parentId":"","message":{"role":"user","content":"Fix auth bug"}}`,
    `{"type":"message","id":"m1","parentId":"m0","message":{"role":"assistant","content":"Looking at login flow"}}`,
    `{"type":"message","id":"m2","parentId":"m1","message":{"role":"user","content":"Update login page"}}`,
    `{"type":"message","id":"m3","parentId":"m2","message":{"role":"assistant","content":"Done with auth bug fix"}}`,
    `{"type":"compaction","summary":"User asked to fix auth bug","details":{}}`,
  ].join("\n") + "\n");

  // Session 3: generic content, no "auth" matches
  writeFileSync(session3, [
    `{"type":"session","version":3,"id":"test-3","timestamp":"2026-04-19T02:00:00Z","cwd":"/test3"}`,
    `{"type":"message","id":"m0","parentId":"","message":{"role":"user","content":"Add feature X"}}`,
    `{"type":"message","id":"m1","parentId":"m0","message":{"role":"assistant","content":"Feature X added"}}`,
  ].join("\n") + "\n");
});

describe.skipIf(!findRgPath())("rgSearch", () => {
  it("finds matches across files", () => {
    const result = rgSearch([session1, session2, session3], "auth");
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
    expect(result.sessionsSearched).toBe(3);
    expect(result.error).toBeUndefined();
  });

  it("returns empty for no matches", () => {
    const result = rgSearch([session1, session2], "zzznonexistent123");
    expect(result.matches.length).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("respects maxResultsPerSession", () => {
    const result = rgSearch([session2], "auth", { maxResultsPerSession: 1 });
    // session2 has "auth" in messages m0 and m3 — should get at most 1
    expect(result.matches.length).toBeLessThanOrEqual(1);
  });

  it("respects maxTotalResults", () => {
    const result = rgSearch([session1, session2], "auth", { maxTotalResults: 2 });
    expect(result.matches.length).toBeLessThanOrEqual(2);
  });

  it("extracts session ID from path", () => {
    const id = extractSessionIdFromPath("/home/user/.pi/sessions/dir/2026-04-19T16-36-50-408Z_abc.jsonl");
    expect(id).toBe("2026-04-19T16-36-50-408Z_abc");
  });

  it("handles empty session paths", () => {
    const result = rgSearch([], "auth");
    expect(result.matches.length).toBe(0);
    expect(result.sessionsSearched).toBe(0);
  });

  it("computes entry index from line number", () => {
    const result = rgSearch([session1], "auth token");
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    // The match should be on line 2 (entry index 1)
    const match = result.matches[0];
    expect(match.entryIndex).toBe(match.lineNumber - 1);
  });

  it("skips non-message entries", () => {
    // "auth bug" appears in compaction summary and in messages
    const result = rgSearch([session2], "auth bug");
    // Only message entries should be included, not the compaction line
    for (const match of result.matches) {
      expect(match.text).toContain('"type":"message"');
    }
  });

  it("handles empty query", () => {
    const result = rgSearch([session1], "");
    expect(result.error).toContain("Empty query");
  });

  it("handles invalid regex", () => {
    const result = rgSearch([session1], "[");
    expect(result.error).toContain("Invalid regex");
  });
});
