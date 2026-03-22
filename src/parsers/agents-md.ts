import { readFileSync } from "node:fs";
import type { Rule } from "../types.js";

/**
 * Parse AGENTS.md / CLAUDE.md and extract verifiable rules.
 *
 * Recognizes patterns:
 *   - "NEVER X in Y"      → must-not-exist in scope Y
 *   - "ALWAYS use X in Y" → must-exist in scope Y
 *   - "❌ X"               → must-not-exist
 *   - "✅ X"               → informational (skip)
 *   - "禁止 X"             → must-not-exist (Chinese)
 *   - "必须 X"             → must-exist (Chinese)
 */

interface ExtractedPattern {
  pattern: string;
  mode: "must-not-exist" | "must-exist";
  scope?: string;
  description: string;
}

const NEVER_PATTERNS = [
  // English
  /\bNEVER\b\s+(?:use\s+)?[`"]?([^`"]+?)[`"]?\s+(?:in|inside|within)\s+[`"]?([^`"\n]+?)[`"]?(?:\s*[—\-–]|$)/gi,
  /\bNEVER\b\s+[`"]?(.+?)[`"]?(?:\s*[—\-–]|$)/gi,
  // Emoji markers
  /❌\s+(?:NEVER\s+)?[`"]?(.+?)[`"]?\s+(?:→|->|in)\s+[`"]?(.+?)[`"]?$/gim,
  /❌\s+(.+?)$/gim,
  // Chinese
  /禁止\s*[`"]?(.+?)[`"]?\s*(?:→|->)/gim,
];

const ALWAYS_PATTERNS = [
  /\bALWAYS\b\s+(?:use\s+)?[`"]?([^`"]+?)[`"]?\s+(?:in|for|when)\s+[`"]?([^`"\n]+?)[`"]?(?:\s*[—\-–]|$)/gi,
  /必须\s*(?:使用\s*)?[`"]?(.+?)[`"]?\s*(?:→|->)/gim,
];

function extractImportPattern(text: string): string | null {
  // "import X from Y" → regex for that import
  const importMatch = text.match(
    /import\s+[`{]?\s*(\w+)\s*[`}]?\s*(?:from\s+)?[`']?([^`'\s]+)?/i
  );
  if (importMatch) {
    const what = importMatch[1];
    const from = importMatch[2];
    if (from) return `import.*${escapeRegex(what)}.*from.*${escapeRegex(from)}`;
    return `import.*${escapeRegex(what)}`;
  }

  // "use X" or reference to a function/module
  const codeMatch = text.match(/[`]([^`]+)[`]/);
  if (codeMatch) return escapeRegex(codeMatch[1]);

  return null;
}

function extractScope(text: string): string | undefined {
  // Look for path-like patterns: apps/*, packages/domain/**, src/routes/**
  const scopeMatch = text.match(
    /(?:in|inside|within|scope:?)\s*[`"]?([a-zA-Z][\w/.*-]+(?:\*\*?)?)[`"]?/i
  );
  if (scopeMatch) return scopeMatch[1];

  // Look for backtick-wrapped paths
  const pathMatch = text.match(/[`]([a-zA-Z][\w/.-]+\/\*?\*?)[`]/);
  if (pathMatch) return pathMatch[1];

  return undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseAgentsMd(filePath: string): Rule[] {
  const content = readFileSync(filePath, "utf-8");
  const rules: Rule[] = [];
  const seen = new Set<string>();
  let ruleIndex = 0;

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Try NEVER patterns
    for (const regex of NEVER_PATTERNS) {
      regex.lastIndex = 0;
      const match = regex.exec(trimmed);
      if (match) {
        const text = match[1]?.trim();
        if (!text || text.length < 3) continue;

        const pattern = extractImportPattern(text);
        if (!pattern) continue;

        const scope = match[2]?.trim() || extractScope(trimmed);
        const key = `${pattern}:${scope ?? "all"}`;
        if (seen.has(key)) continue;
        seen.add(key);

        ruleIndex++;
        rules.push({
          id: `agents-md-${ruleIndex}`,
          description: trimmed.slice(0, 512),
          severity: "error",
          category: "custom",
          checker: {
            type: "pattern",
            pattern,
            mode: "must-not-exist",
            target: "content",
          },
          scope: scope ? `${scope.replace(/\/?$/, "/**")}` : undefined,
          source: filePath,
        });
        break;
      }
    }

    // Try ALWAYS patterns
    for (const regex of ALWAYS_PATTERNS) {
      regex.lastIndex = 0;
      const match = regex.exec(trimmed);
      if (match) {
        const text = match[1]?.trim();
        if (!text || text.length < 3) continue;

        const pattern = extractImportPattern(text);
        if (!pattern) continue;

        const scope = match[2]?.trim() || extractScope(trimmed);
        const key = `must:${pattern}:${scope ?? "all"}`;
        if (seen.has(key)) continue;
        seen.add(key);

        ruleIndex++;
        rules.push({
          id: `agents-md-${ruleIndex}`,
          description: trimmed.slice(0, 512),
          severity: "warning",
          category: "custom",
          checker: {
            type: "pattern",
            pattern,
            mode: "must-exist",
            target: "content",
          },
          scope: scope ? `${scope.replace(/\/?$/, "/**")}` : undefined,
          source: filePath,
        });
        break;
      }
    }
  }

  return rules;
}
