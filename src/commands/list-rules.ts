import { loadRules, loadConfig } from "../engine/loader.js";
import { parseAgentsMd } from "../parsers/agents-md.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";

const SEV_COLOR = { error: RED, warning: YELLOW, info: DIM };

export async function listRules(projectDir: string) {
  let rules = loadRules(projectDir);

  // Also load AGENTS.md rules
  const config = loadConfig(projectDir);
  if (config["agents-md"]?.enabled !== false) {
    for (const name of [config["agents-md"]?.path, "AGENTS.md", "CLAUDE.md"]) {
      if (!name) continue;
      const p = join(projectDir, name);
      if (existsSync(p)) {
        rules.push(...parseAgentsMd(p));
        break;
      }
    }
  }

  if (rules.length === 0) {
    console.log("No rules loaded. Run `agentlint init` first.");
    return;
  }

  console.log(`\n${rules.length} rules loaded:\n`);

  // Group by category
  const groups = new Map<string, typeof rules>();
  for (const r of rules) {
    const cat = r.category ?? "custom";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(r);
  }

  for (const [category, categoryRules] of groups) {
    console.log(`  ${BLUE}${category}${RESET}`);
    for (const r of categoryRules) {
      const color = SEV_COLOR[r.severity];
      const scope = r.scope
        ? ` ${DIM}[${typeof r.scope === "string" ? r.scope : (r.scope.include ?? []).join(", ")}]${RESET}`
        : "";
      console.log(
        `    ${color}${r.severity.padEnd(7)}${RESET}  ${r.id.padEnd(30)}  ${DIM}${r.description.slice(0, 60)}${RESET}${scope}`
      );
    }
    console.log("");
  }
}
