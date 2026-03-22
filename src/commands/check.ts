import { loadRules, loadConfig } from "../engine/loader.js";
import { runChecks } from "../engine/runner.js";
import { parseAgentsMd } from "../parsers/agents-md.js";
import { formatTerminal } from "../reporters/terminal.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

interface CheckOptions {
  format: "terminal" | "json";
  staged: boolean;
  quiet: boolean;
}

export async function check(projectDir: string, options: CheckOptions) {
  // Load rules
  let rules = loadRules(projectDir);

  // Load AGENTS.md rules
  const config = loadConfig(projectDir);
  if (config["agents-md"]?.enabled !== false) {
    const mdPaths = [
      config["agents-md"]?.path,
      "AGENTS.md",
      "CLAUDE.md",
    ]
      .filter(Boolean)
      .map((p) => join(projectDir, p!));

    for (const mdPath of mdPaths) {
      if (existsSync(mdPath)) {
        const agentRules = parseAgentsMd(mdPath);
        rules.push(...agentRules);
        break;
      }
    }
  }

  if (rules.length === 0) {
    console.log("No rules loaded. Run `agentlint init` first.");
    return;
  }

  // Run checks
  const result = await runChecks(projectDir, rules, { staged: options.staged });

  // Output
  if (options.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (!options.quiet || result.violations.length > 0) {
      console.log(formatTerminal(result, projectDir));
    }
  }

  // Exit code
  if (!result.passed) {
    process.exit(1);
  }
}
