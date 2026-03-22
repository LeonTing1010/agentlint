import { readFileSync } from "node:fs";
import type { Rule } from "../types.js";

/**
 * Parse AGENTS.md / CLAUDE.md and extract verifiable rules.
 *
 * Only extracts rules that have BOTH:
 *   1. A clear prohibition/requirement keyword (NEVER, ALWAYS, 禁止, 必须)
 *   2. A code-like pattern in backticks that can be used as a grep regex
 *
 * Skips:
 *   - ❌ lines without NEVER/禁止 (they're documentation, not enforceable rules)
 *   - Lines inside tables (| ... |) — table cells are descriptions
 *   - Lines inside code blocks (``` ... ```)
 *   - Patterns that are too short (< 4 chars) or too generic (e.g. `.*`)
 */

/** Patterns that indicate "do not do this" */
const PROHIBITION_PATTERNS = [
  // "NEVER import X from Y" or "NEVER use X in Y"
  /\bNEVER\b\s+(?:use\s+|import\s+)?[`]([^`]{4,})[`]\s+(?:in|inside|within|from)\s+[`]([^`]+)[`]/gi,
  /\bNEVER\b\s+(?:use\s+|import\s+)?[`]([^`]{4,})[`]/gi,
  // "❌ NEVER X" (must have NEVER after ❌, not just ❌ alone)
  /❌\s+(?:NEVER\s+)[`]([^`]{4,})[`]/gi,
  // Chinese: "禁止 X"
  /禁止\s+[`]([^`]{4,})[`]/gi,
];

/** Patterns that indicate "must do this" */
const REQUIREMENT_PATTERNS = [
  /\bALWAYS\b\s+(?:use\s+)?[`]([^`]{4,})[`]\s+(?:in|for|when)\s+[`]([^`]+)[`]/gi,
  /必须\s+(?:使用\s+)?[`]([^`]{4,})[`]/gi,
];

/** Extract a grep-able regex from a backtick code reference */
function toGrepPattern(text: string): string | null {
  // Skip patterns that are too generic or are descriptions, not code
  const skipPatterns = [
    /^\.\*$/,           // just ".*"
    /^[a-z]{1,3}$/i,   // single short word
    /[\u4e00-\u9fff]/,  // Chinese characters (description, not code)
    /^https?:/,         // URLs
    /\s{3,}/,           // too many spaces (likely prose)
  ];
  for (const skip of skipPatterns) {
    if (skip.test(text)) return null;
  }

  // If it looks like an import statement, extract the pattern
  const importMatch = text.match(/import\s*[{`]?\s*(\w+)\s*[}`]?\s*(?:from\s+)?['"`]?([^'"`\s]+)?/i);
  if (importMatch) {
    const what = escapeRegex(importMatch[1]);
    const from = importMatch[2] ? escapeRegex(importMatch[2]) : null;
    return from ? `import.*${what}.*from.*${from}` : `import.*${what}`;
  }

  // If it looks like a function call or identifier, use as-is
  if (/^[\w$.]+\(/.test(text) || /^[\w$.]+$/.test(text)) {
    return escapeRegex(text);
  }

  // If it contains code-like characters (dots, parens, arrows), use as-is
  if (/[.()\[\]{}=><]/.test(text) && text.length >= 4) {
    return escapeRegex(text);
  }

  return null;
}

/** Extract scope from the line text */
function extractScope(text: string): string | undefined {
  // Match path-like patterns in backticks: `apps/*`, `packages/domain/**`
  const pathMatch = text.match(/[`]([a-zA-Z][\w/.*-]+(?:\/\*\*?))[`]/);
  if (pathMatch) return pathMatch[1];

  // Match "in apps/" or "in packages/domain/"
  const inMatch = text.match(/(?:in|inside|within)\s+[`]?([a-zA-Z][\w/.*-]+\/)[`]?/i);
  if (inMatch) return inMatch[1] + "**";

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
  let inCodeBlock = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip code blocks
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Skip empty lines, headings, table rows
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("|")) continue;

    // Try prohibition patterns
    for (const regex of PROHIBITION_PATTERNS) {
      regex.lastIndex = 0;
      const match = regex.exec(trimmed);
      if (!match) continue;

      const codeRef = match[1]?.trim();
      if (!codeRef) continue;

      const pattern = toGrepPattern(codeRef);
      if (!pattern) continue;

      const scope = match[2]?.trim()
        ? `${match[2].trim().replace(/\/?$/, "/**")}`
        : extractScope(trimmed);

      const key = `never:${pattern}:${scope ?? "all"}`;
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
        scope,
        source: filePath,
      });
      break;
    }

    // Try requirement patterns
    for (const regex of REQUIREMENT_PATTERNS) {
      regex.lastIndex = 0;
      const match = regex.exec(trimmed);
      if (!match) continue;

      const codeRef = match[1]?.trim();
      if (!codeRef) continue;

      const pattern = toGrepPattern(codeRef);
      if (!pattern) continue;

      const scope = match[2]?.trim()
        ? `${match[2].trim().replace(/\/?$/, "/**")}`
        : extractScope(trimmed);

      const key = `always:${pattern}:${scope ?? "all"}`;
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
        scope,
        source: filePath,
      });
      break;
    }
  }

  return rules;
}
