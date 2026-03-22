/** Rule severity levels */
export type Severity = "error" | "warning" | "info";

/** Rule categories */
export type Category =
  | "layering"
  | "security"
  | "consistency"
  | "safety"
  | "custom";

/** Pattern checker modes */
export type PatternMode = "must-not-exist" | "must-exist" | "must-contain";

/** Checker definition */
export type Checker =
  | PatternChecker
  | CommandChecker
  | CompositeChecker;

export interface PatternChecker {
  type: "pattern";
  pattern: string;
  mode: PatternMode;
  target?: "content" | "filename" | "path";
}

export interface CommandChecker {
  type: "command";
  command: string;
  timeout?: number;
}

export interface CompositeChecker {
  type: "composite";
  operator: "and" | "or" | "not";
  checkers: Checker[];
}

/** Scope definition */
export interface Scope {
  include?: string[];
  exclude?: string[];
}

/** Rule documentation */
export interface RuleDocs {
  rationale?: string;
  fix?: string;
  references?: string[];
  examples?: {
    correct?: string;
    incorrect?: string;
  };
}

/** A single AgentLint rule */
export interface Rule {
  id: string;
  /** Human-readable name (AI Coding Rules compat) */
  name?: string;
  description: string;
  severity: Severity;
  checker: Checker;
  category?: Category;
  tags?: string[];
  /** AI Coding Rules compat: file glob patterns for activation */
  globs?: string[];
  /** AI Coding Rules compat: true = apply to all files regardless of globs */
  alwaysApply?: boolean;
  scope?: string | Scope;
  docs?: RuleDocs;
  /** Where this rule came from */
  source?: string;
}

/** Result of checking a single rule */
export interface Violation {
  ruleId: string;
  severity: Severity;
  message: string;
  file: string;
  line?: number;
  source?: string;
}

/** Result of running all checks */
export interface CheckResult {
  passed: boolean;
  violations: Violation[];
  rulesChecked: number;
  filesChecked: number;
  duration: number;
}

/** .agentlint.yaml configuration */
export interface AgentLintConfig {
  extends?: string[];
  rules?: Record<string, Severity | "off">;
  "agents-md"?: {
    enabled?: boolean;
    path?: string;
  };
  include?: string[];
  exclude?: string[];
}

/** pond.json — tracks managed files for clean uninstall */
export interface PondManifest {
  version: string;
  installedAt: string;
  managedFiles: string[];
  platform?: string;
}
