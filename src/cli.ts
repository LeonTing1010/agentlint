#!/usr/bin/env node

import { parseArgs } from "node:util";
import { init } from "./commands/init.js";
import { check } from "./commands/check.js";
import { uninstall } from "./commands/uninstall.js";
import { listRules } from "./commands/list-rules.js";

const HELP = `
agentlint — AGENTS.md defines the rules. AgentLint enforces them.

Usage:
  agentlint init          Initialize AgentLint in current project
  agentlint check         Run all rules against your code
  agentlint check --staged  Check only staged files (pre-commit)
  agentlint list-rules    List all active rules
  agentlint uninstall     Remove AgentLint from current project
  agentlint --help        Show this help
  agentlint --version     Show version

Options:
  --format <terminal|json>  Output format (default: terminal)
  --staged                  Only check staged files
  --quiet                   Only output violations
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      format: { type: "string", default: "terminal" },
      staged: { type: "boolean", default: false },
      quiet: { type: "boolean", short: "q", default: false },
    },
  });

  if (values.version) {
    const pkg = await import("../package.json", { with: { type: "json" } });
    console.log(pkg.default.version);
    return;
  }

  if (values.help || positionals.length === 0) {
    console.log(HELP.trim());
    return;
  }

  const command = positionals[0];

  switch (command) {
    case "init":
      await init(process.cwd());
      break;
    case "check":
      await check(process.cwd(), {
        format: (values.format as "terminal" | "json") ?? "terminal",
        staged: values.staged ?? false,
        quiet: values.quiet ?? false,
      });
      break;
    case "list-rules":
      await listRules(process.cwd());
      break;
    case "uninstall":
      await uninstall(process.cwd());
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP.trim());
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
