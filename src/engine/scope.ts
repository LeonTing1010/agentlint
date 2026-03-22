import { relative } from "node:path";
import type { Scope } from "../types.js";

/** Simple glob matching (supports * and **) */
function matchGlob(pattern: string, filePath: string): boolean {
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${regex}$`).test(filePath);
}

/** Resolve scope to matching files */
export function resolveScope(
  files: string[],
  scope: string | Scope | undefined,
  projectDir: string
): string[] {
  if (!scope) return files;

  let includePatterns: string[];
  let excludePatterns: string[] = [];

  if (typeof scope === "string") {
    includePatterns = [scope];
  } else {
    includePatterns = scope.include ?? ["**"];
    excludePatterns = scope.exclude ?? [];
  }

  return files.filter((absPath) => {
    const rel = relative(projectDir, absPath);
    const included = includePatterns.some((p) => matchGlob(p, rel));
    const excluded = excludePatterns.some((p) => matchGlob(p, rel));
    return included && !excluded;
  });
}
