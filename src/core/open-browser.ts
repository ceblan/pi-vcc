import { exec } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import type { FormattedSessionRow } from "./format-search";

async function exportToHtml(sessionPath: string, outputPath: string): Promise<string> {
  // Deep import — Pi does not re-export exportFromFile from its public index.
  // Resolve the package directory first, then navigate to the internal module.
  const piPkgMain = require.resolve("@mariozechner/pi-coding-agent");
  const piPkgDir = piPkgMain.replace(/\/dist\/.*$/, "");
  const exportHtmlPath = join(piPkgDir, "dist", "core", "export-html", "index.js");
  const mod = await import(exportHtmlPath);
  return (mod as { exportFromFile: (path: string, opts: { outputPath: string }) => Promise<string> }).exportFromFile(
    sessionPath,
    { outputPath },
  );
}

// @lat: [[core#Core Modules#open-browser.ts]]
export async function openSessionInBrowser(row: FormattedSessionRow): Promise<void> {
  const tmpPath = join(tmpdir(), `pi-vcc-session-${row.fullSessionId}.html`);
  const htmlPath = await exportToHtml(row.path, tmpPath);
  const openCmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${openCmd} "${htmlPath}"`);
}
