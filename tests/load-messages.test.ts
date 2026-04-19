import { describe, it, expect, afterAll } from "vitest";
import { loadMessageAtLine } from "../src/core/load-messages";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const TMP_DIR = "/tmp/vcc-test-load-message";
const TMP_FILE = join(TMP_DIR, "test-session.jsonl");

// Helper: write JSONL lines to temp file
const writeJsonl = (lines: object[]) => {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(TMP_FILE, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
};

describe("loadMessageAtLine", () => {
  afterAll(() => { rmSync(TMP_DIR, { recursive: true, force: true }); });

  it("reads a message at the correct line number", () => {
    writeJsonl([
      { type: "session", id: "test" },
      { type: "message", message: { role: "user", content: "Hello world" } },
      { type: "message", message: { role: "assistant", content: "Hi there" } },
    ]);
    // Line 2 (1-based) = user message
    const result = loadMessageAtLine(TMP_FILE, 2);
    expect(result).not.toBeNull();
    expect(result!.role).toBe("user");
    expect(result!.summary).toBe("Hello world");
    expect(result!.index).toBe(1); // lineNumber - 1
  });

  it("returns null for non-message line (session header)", () => {
    writeJsonl([
      { type: "session", id: "test" },
      { type: "message", message: { role: "user", content: "Hello" } },
    ]);
    const result = loadMessageAtLine(TMP_FILE, 1); // session header
    expect(result).toBeNull();
  });

  it("returns null for out-of-bounds line number", () => {
    writeJsonl([
      { type: "message", message: { role: "user", content: "Hello" } },
    ]);
    const result = loadMessageAtLine(TMP_FILE, 99);
    expect(result).toBeNull();
  });

  it("returns full untruncated content", () => {
    const longText = "A".repeat(500);
    writeJsonl([
      { type: "message", message: { role: "user", content: longText } },
    ]);
    const result = loadMessageAtLine(TMP_FILE, 1);
    expect(result!.summary).toBe(longText); // Not truncated
  });

  it("returns null for invalid JSON line", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(TMP_FILE, "not-json\n{\"type\":\"message\",\"message\":{\"role\":\"user\",\"content\":\"ok\"}}\n");
    const result = loadMessageAtLine(TMP_FILE, 1);
    expect(result).toBeNull();
  });

  it("returns null for compaction entry", () => {
    writeJsonl([
      { type: "session", id: "test" },
      { type: "message", message: { role: "user", content: "Hello" } },
      { type: "compaction", summary: "Compacted" },
    ]);
    const result = loadMessageAtLine(TMP_FILE, 3); // compaction line
    expect(result).toBeNull();
  });

  it("returns null for empty line", () => {
    writeJsonl([
      { type: "message", message: { role: "user", content: "Hello" } },
    ]);
    // Line after the last entry is empty (trailing newline)
    const result = loadMessageAtLine(TMP_FILE, 2);
    expect(result).toBeNull();
  });

  it("reads first message when session header precedes it", () => {
    writeJsonl([
      { type: "session", id: "test", version: 3 },
      { type: "message", message: { role: "user", content: "First message" } },
    ]);
    const result = loadMessageAtLine(TMP_FILE, 2);
    expect(result).not.toBeNull();
    expect(result!.role).toBe("user");
    expect(result!.summary).toBe("First message");
    expect(result!.index).toBe(1);
  });
});
