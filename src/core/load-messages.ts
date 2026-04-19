import { readFileSync } from "fs";
import type { Message } from "@mariozechner/pi-ai";
import { renderMessage, type RenderedEntry } from "./render-entries";

export interface LoadedMessages {
  rendered: RenderedEntry[];
  rawMessages: Message[];
}

export const loadAllMessages = (sessionFile: string, full: boolean): LoadedMessages => {
  const content = readFileSync(sessionFile, "utf-8");
  const entries: any[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch {}
  }
  const messageEntries = entries.filter((e) => e.type === "message" && e.message);
  const rendered = messageEntries.map((e, i) => renderMessage(e.message, i, full));
  const rawMessages = messageEntries.map((e) => e.message);
  return { rendered, rawMessages };
};

/** Read and render a single message from a JSONL file by 1-based line number. */
export const loadMessageAtLine = (
  sessionPath: string,
  lineNumber: number,
): RenderedEntry | null => {
  const content = readFileSync(sessionPath, "utf-8");
  const lines = content.split("\n");
  const line = lines[lineNumber - 1];
  if (!line?.trim()) return null;
  try {
    const parsed = JSON.parse(line);
    if (parsed.type !== "message" || !parsed.message) return null;
    return renderMessage(parsed.message, lineNumber - 1, true);
  } catch {
    return null;
  }
};
