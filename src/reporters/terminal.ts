import { relative } from "node:path";
import type { CheckResult } from "../types.js";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const SEVERITY_ICON = {
  error: `${RED}✗${RESET}`,
  warning: `${YELLOW}!${RESET}`,
  info: `${DIM}i${RESET}`,
};

export function formatTerminal(result: CheckResult, cwd: string): string {
  const lines: string[] = [];

  if (result.violations.length === 0) {
    lines.push(`${GREEN}✓${RESET} All ${result.rulesChecked} rules passed ${DIM}(${result.filesChecked} files, ${result.duration}ms)${RESET}`);
    return lines.join("\n");
  }

  // Group by file
  const byFile = new Map<string, typeof result.violations>();
  for (const v of result.violations) {
    const rel = relative(cwd, v.file);
    if (!byFile.has(rel)) byFile.set(rel, []);
    byFile.get(rel)!.push(v);
  }

  for (const [file, violations] of byFile) {
    lines.push(`${BOLD}${file}${RESET}`);
    for (const v of violations) {
      const loc = v.line ? `:${v.line}` : "";
      const icon = SEVERITY_ICON[v.severity];
      lines.push(`  ${icon} ${v.ruleId} ${DIM}${v.message}${RESET} ${DIM}${file}${loc}${RESET}`);
    }
    lines.push("");
  }

  const errors = result.violations.filter((v) => v.severity === "error").length;
  const warnings = result.violations.filter((v) => v.severity === "warning").length;

  const parts: string[] = [];
  if (errors) parts.push(`${RED}${errors} error${errors > 1 ? "s" : ""}${RESET}`);
  if (warnings) parts.push(`${YELLOW}${warnings} warning${warnings > 1 ? "s" : ""}${RESET}`);
  parts.push(`${DIM}(${result.rulesChecked} rules, ${result.filesChecked} files, ${result.duration}ms)${RESET}`);

  lines.push(parts.join("  "));
  return lines.join("\n");
}
