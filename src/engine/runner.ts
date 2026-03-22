import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, relative } from "node:path";
import type {
  Rule,
  Checker,
  PatternChecker,
  CommandChecker,
  CompositeChecker,
  Violation,
  CheckResult,
} from "../types.js";
import { resolveScope } from "./scope.js";
import { join } from "node:path";

/** Load .agentlintignore patterns (like .gitignore) */
function loadIgnorePatterns(projectDir: string): string[] {
  const ignorePath = join(projectDir, ".agentlintignore");
  if (!existsSync(ignorePath)) return [];
  return readFileSync(ignorePath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

/** Match a gitignore-style pattern against a relative path */
function matchIgnorePattern(pattern: string, filePath: string): boolean {
  // Simple glob: * matches non-slash, ** matches everything
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(regex).test(filePath);
}

/** Run a pattern checker against file content */
function checkPattern(
  checker: PatternChecker,
  filePath: string,
  content: string
): Violation[] {
  const violations: Violation[] = [];
  const regex = new RegExp(checker.pattern, "g");
  const target = checker.target ?? "content";

  let searchText: string;
  if (target === "content") searchText = content;
  else if (target === "filename") searchText = filePath.split("/").pop() ?? "";
  else searchText = filePath;

  const found = regex.test(searchText);

  if (checker.mode === "must-not-exist" && found) {
    // Find line numbers
    const lines = content.split("\n");
    const lineRegex = new RegExp(checker.pattern);
    for (let i = 0; i < lines.length; i++) {
      if (lineRegex.test(lines[i])) {
        violations.push({
          ruleId: "", // filled by caller
          severity: "error",
          message: "",
          file: filePath,
          line: i + 1,
        });
      }
    }
    // At least one violation if no line match (e.g. multiline)
    if (violations.length === 0) {
      violations.push({
        ruleId: "",
        severity: "error",
        message: "",
        file: filePath,
      });
    }
  } else if (checker.mode === "must-exist" && !found) {
    violations.push({
      ruleId: "",
      severity: "error",
      message: "",
      file: filePath,
    });
  } else if (checker.mode === "must-contain" && !found) {
    violations.push({
      ruleId: "",
      severity: "error",
      message: "",
      file: filePath,
    });
  }

  return violations;
}

/** Run a command checker */
function checkCommand(
  checker: CommandChecker,
  projectDir: string
): Violation[] {
  try {
    execSync(checker.command, {
      cwd: projectDir,
      timeout: (checker.timeout ?? 30) * 1000,
      stdio: "pipe",
    });
    return [];
  } catch (err) {
    const error = err as { stdout?: Buffer; stderr?: Buffer };
    const message =
      error.stdout?.toString().trim() ||
      error.stderr?.toString().trim() ||
      "Command check failed";
    return [
      {
        ruleId: "",
        severity: "error",
        message,
        file: projectDir,
      },
    ];
  }
}

/** Run a composite checker */
function checkComposite(
  checker: CompositeChecker,
  filePath: string,
  content: string,
  projectDir: string
): Violation[] {
  const results = checker.checkers.map((c) =>
    runChecker(c, filePath, content, projectDir)
  );

  if (checker.operator === "and") {
    // All must pass (no violations)
    return results.flat();
  } else if (checker.operator === "or") {
    // At least one must pass
    const allFailed = results.every((r) => r.length > 0);
    return allFailed ? results[0] : [];
  } else {
    // not: invert — violation if check passes (no violations)
    return results[0].length === 0
      ? [{ ruleId: "", severity: "error", message: "", file: filePath }]
      : [];
  }
}

/** Run a single checker against a file */
function runChecker(
  checker: Checker,
  filePath: string,
  content: string,
  projectDir: string
): Violation[] {
  switch (checker.type) {
    case "pattern":
      return checkPattern(checker, filePath, content);
    case "command":
      return checkCommand(checker, projectDir);
    case "composite":
      return checkComposite(checker, filePath, content, projectDir);
    default:
      return [];
  }
}

/** Run all rules against project files */
export async function runChecks(
  projectDir: string,
  rules: Rule[],
  options: { staged?: boolean; files?: string[] } = {}
): Promise<CheckResult> {
  const start = Date.now();
  const violations: Violation[] = [];
  const checkedFiles = new Set<string>();

  // Get file list
  let files: string[];
  if (options.files) {
    files = options.files.map((f) => resolve(projectDir, f));
  } else if (options.staged) {
    try {
      const output = execSync("git diff --cached --name-only --diff-filter=ACMR", {
        cwd: projectDir,
        encoding: "utf-8",
      });
      files = output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((f) => resolve(projectDir, f));
    } catch {
      files = [];
    }
  } else {
    // Get all tracked files
    try {
      const output = execSync("git ls-files", {
        cwd: projectDir,
        encoding: "utf-8",
      });
      files = output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((f) => resolve(projectDir, f));
    } catch {
      files = [];
    }
  }

  // Default excludes — always skip these regardless of config
  const DEFAULT_EXCLUDES = [
    /node_modules\//,
    /\.git\//,
    /dist\//,
    /build\//,
    /\.next\//,
    /\.bak$/,
    /\.map$/,
    /\.min\.js$/,
    /package-lock\.json$/,
    /pnpm-lock\.yaml$/,
    /yarn\.lock$/,
    /bun\.lockb$/,
  ];

  // Load .agentlintignore (like .gitignore — user-defined exclusions)
  const ignorePatterns = loadIgnorePatterns(projectDir);

  files = files.filter((f) => {
    const rel = relative(projectDir, f);
    if (DEFAULT_EXCLUDES.some((r) => r.test(rel))) return false;
    if (ignorePatterns.some((p) => matchIgnorePattern(p, rel))) return false;
    return true;
  });

  for (const rule of rules) {
    // Command checkers run once, not per-file
    if (rule.checker.type === "command") {
      const v = checkCommand(rule.checker, projectDir);
      for (const violation of v) {
        violations.push({
          ...violation,
          ruleId: rule.id,
          severity: rule.severity,
          message: violation.message || rule.description,
          source: rule.source,
        });
      }
      continue;
    }

    // Resolve scope to matching files
    const scopeFiles = resolveScope(files, rule.scope, projectDir);

    for (const filePath of scopeFiles) {
      if (!existsSync(filePath)) continue;

      let content: string;
      try {
        content = readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }

      checkedFiles.add(filePath);

      const v = runChecker(rule.checker, filePath, content, projectDir);
      for (const violation of v) {
        violations.push({
          ...violation,
          ruleId: rule.id,
          severity: rule.severity,
          message: violation.message || rule.description,
          source: rule.source,
        });
      }
    }
  }

  return {
    passed: !violations.some((v) => v.severity === "error"),
    violations,
    rulesChecked: rules.length,
    filesChecked: checkedFiles.size,
    duration: Date.now() - start,
  };
}
