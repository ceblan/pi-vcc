import { describe, it, expect } from "vitest";

/**
 * Test parseArgs logic extracted from src/commands/vcc-search.ts.
 * We re-implement parseArgs here to test it without importing the module
 * (which depends on the ExtensionAPI at import time).
 */

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

describe("parseArgs", () => {
  it("parses simple query", () => {
    const result = parseArgs("auth token");
    expect(result.query).toBe("auth token");
    expect(result.scope).toBeUndefined();
  });

  it("parses --scope flag", () => {
    const result = parseArgs("auth --scope all");
    expect(result.query).toBe("auth");
    expect(result.scope).toBe("all");
  });

  it("parses inline page:N", () => {
    const result = parseArgs("auth page:2");
    expect(result.query).toBe("auth");
    expect(result.page).toBe(2);
  });

  it("parses --page flag", () => {
    const result = parseArgs("auth --page 3");
    expect(result.query).toBe("auth");
    expect(result.page).toBe(3);
  });

  it("parses all flags", () => {
    const result = parseArgs("auth --scope all --max-results 5 --page 2");
    expect(result.query).toBe("auth");
    expect(result.scope).toBe("all");
    expect(result.maxResults).toBe(5);
    expect(result.page).toBe(2);
  });

  it("handles empty args", () => {
    const result = parseArgs("");
    expect(result.query).toBe("");
  });

  it("handles regex query", () => {
    const result = parseArgs("auth|token");
    expect(result.query).toBe("auth|token");
  });
});
