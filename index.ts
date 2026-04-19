import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerBeforeCompactHook } from "./src/hooks/before-compact";
import { registerPiVccCommand } from "./src/commands/pi-vcc";
import { registerVccRecallCommand } from "./src/commands/vcc-recall";
import { registerRecallTool } from "./src/tools/recall";
import { registerSearchTool } from "./src/tools/search";
import { registerVccSearchCommand } from "./src/commands/vcc-search";

export default (pi: ExtensionAPI) => {
  registerBeforeCompactHook(pi);
  registerPiVccCommand(pi);
  registerVccRecallCommand(pi);
  registerRecallTool(pi);
  registerSearchTool(pi);
  registerVccSearchCommand(pi);
};
