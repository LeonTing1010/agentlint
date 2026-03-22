import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Rule, AgentLintConfig, Severity } from "../types.js";

/** Parse YAML frontmatter-style rule files (simple parser, no deps) */
function parseYamlRule(content: string, filePath: string): Rule | null {
  const lines = content.split("\n");
  const rule: Record<string, unknown> = {};
  const checker: Record<string, unknown> = { type: "pattern" };
  const scope: Record<string, unknown> = {};
  const docs: Record<string, unknown> = {};
  let currentSection = "root";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "") continue;

    // Detect section
    if (trimmed === "checker:") { currentSection = "checker"; continue; }
    if (trimmed === "scope:") { currentSection = "scope"; continue; }
    if (trimmed === "docs:") { currentSection = "docs"; continue; }

    const match = trimmed.match(/^(\w[\w-]*):\s*(.+)$/);
    if (!match) {
      // Handle array items (- value)
      const arrayMatch = trimmed.match(/^-\s+(.+)$/);
      if (arrayMatch) {
        if (currentSection === "scope") {
          const key = "include";
          if (!scope[key]) scope[key] = [];
          (scope[key] as string[]).push(arrayMatch[1].replace(/^["']|["']$/g, ""));
        }
        if (currentSection === "root" && rule._lastKey === "tags") {
          if (!rule.tags) rule.tags = [];
          (rule.tags as string[]).push(arrayMatch[1]);
        }
      }
      continue;
    }

    const [, key, rawVal] = match;
    // Preserve regex backslashes: YAML "\\b" → JS "\b" (word boundary)
    // Strip outer quotes, then unescape YAML double-backslashes
    const unquoted = rawVal.replace(/^["']|["']$/g, "").trim();
    const val = unquoted.replace(/\\\\/g, "\\");

    if (currentSection === "checker") {
      checker[key] = val;
    } else if (currentSection === "scope") {
      if (key === "include" || key === "exclude") {
        scope[key] = val.startsWith("[") ? JSON.parse(val.replace(/'/g, '"')) : [val];
      }
    } else if (currentSection === "docs") {
      docs[key] = val;
    } else {
      rule[key] = val;
      rule._lastKey = key;
    }
  }

  if (!rule.id || !rule.description || !rule.severity) return null;

  const scopeObj = Object.keys(scope).length > 0 ? scope : undefined;
  // Handle shorthand scope: string at root level
  const finalScope = rule.scope
    ? (typeof rule.scope === "string" ? rule.scope : scopeObj)
    : scopeObj;

  return {
    id: rule.id as string,
    description: rule.description as string,
    severity: rule.severity as Severity,
    category: rule.category as Rule["category"],
    tags: rule.tags as string[],
    scope: finalScope as Rule["scope"],
    docs: Object.keys(docs).length > 0 ? docs as Rule["docs"] : undefined,
    checker: {
      type: (checker.type as string) || "pattern",
      pattern: checker.pattern as string,
      mode: (checker.mode as string) || "must-not-exist",
      target: (checker.target as string) || "content",
    } as Rule["checker"],
    source: filePath,
  };
}

/** Load rules from a directory of YAML files */
export function loadRulesFromDir(dir: string): Rule[] {
  if (!existsSync(dir)) return [];
  const rules: Rule[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
    const content = readFileSync(join(dir, file), "utf-8");
    const rule = parseYamlRule(content, join(dir, file));
    if (rule) rules.push(rule);
  }
  return rules;
}

/** Load built-in rules from the agentlint package */
function loadBuiltinRules(packName: string): Rule[] {
  // agentlint:recommended → rules/recommended/
  const name = packName.replace("agentlint:", "");
  // Look relative to this module (inside the npm package)
  const builtinDir = resolve(
    new URL(".", import.meta.url).pathname,
    "../../rules",
    name
  );
  return loadRulesFromDir(builtinDir);
}

/** Load the .agentlint.yaml config */
export function loadConfig(projectDir: string): AgentLintConfig {
  const configPath = join(projectDir, ".agentlint.yaml");
  if (!existsSync(configPath)) {
    return { extends: ["agentlint:recommended"], "agents-md": { enabled: true } };
  }
  // Simple YAML parser for config (flat structure)
  const content = readFileSync(configPath, "utf-8");
  const config: AgentLintConfig = {};
  const lines = content.split("\n");
  let currentKey = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed === "") continue;

    if (!line.startsWith(" ") && !line.startsWith("\t")) {
      const match = trimmed.match(/^([\w-]+):\s*(.*)$/);
      if (match) {
        currentKey = match[1];
        if (match[2] && match[2] !== "") {
          if (currentKey === "agents-md") {
            // handled below
          } else {
            (config as Record<string, unknown>)[currentKey] = match[2];
          }
        }
      }
    } else {
      // Indented line — part of current section
      const itemMatch = trimmed.match(/^-\s+(.+)$/);
      if (itemMatch) {
        if (currentKey === "extends") {
          if (!config.extends) config.extends = [];
          config.extends.push(itemMatch[1].replace(/^["']|["']$/g, ""));
        } else if (currentKey === "include") {
          if (!config.include) config.include = [];
          config.include.push(itemMatch[1].replace(/^["']|["']$/g, ""));
        } else if (currentKey === "exclude") {
          if (!config.exclude) config.exclude = [];
          config.exclude.push(itemMatch[1].replace(/^["']|["']$/g, ""));
        }
      }
      const kvMatch = trimmed.match(/^([\w-]+):\s*(.+)$/);
      if (kvMatch) {
        if (currentKey === "rules") {
          if (!config.rules) config.rules = {};
          config.rules[kvMatch[1]] = kvMatch[2] as Severity | "off";
        }
        if (currentKey === "agents-md") {
          if (!config["agents-md"]) config["agents-md"] = {};
          const v = kvMatch[2];
          if (kvMatch[1] === "enabled") config["agents-md"].enabled = v === "true";
          if (kvMatch[1] === "path") config["agents-md"].path = v;
        }
      }
    }
  }

  return config;
}

/** Load all rules based on config */
export function loadRules(projectDir: string): Rule[] {
  const config = loadConfig(projectDir);
  let rules: Rule[] = [];

  // Load from extends
  for (const ext of config.extends ?? ["agentlint:recommended"]) {
    if (ext.startsWith("agentlint:")) {
      rules.push(...loadBuiltinRules(ext));
    } else if (ext.startsWith("./") || ext.startsWith("../")) {
      rules.push(...loadRulesFromDir(resolve(projectDir, ext)));
    }
    // npm packages: @community/nextjs → node_modules/@community/agentlint-rules-nextjs/rules/
    // TODO: implement npm rule pack resolution
  }

  // Load project-specific rules
  const localRulesDir = join(projectDir, ".agentlint", "rules");
  rules.push(...loadRulesFromDir(localRulesDir));

  // Apply rule overrides from config
  if (config.rules) {
    rules = rules.filter((r) => config.rules![r.id] !== "off");
    rules = rules.map((r) => {
      const override = config.rules![r.id];
      if (override && override !== "off") {
        return { ...r, severity: override };
      }
      return r;
    });
  }

  return rules;
}
