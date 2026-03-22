import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Platform =
  | "claude-code"
  | "cursor"
  | "codex"
  | "copilot"
  | "gemini-cli";

/** Detect which AI coding agent platforms are in use */
export function detectPlatforms(projectDir: string): Platform[] {
  const platforms: Platform[] = [];

  // Claude Code: .claude/ directory
  if (existsSync(join(projectDir, ".claude"))) {
    platforms.push("claude-code");
  }

  // Cursor: .cursor/ or .cursorrules
  if (
    existsSync(join(projectDir, ".cursor")) ||
    existsSync(join(projectDir, ".cursorrules"))
  ) {
    platforms.push("cursor");
  }

  // Codex: AGENTS.md (OpenAI Codex convention)
  if (existsSync(join(projectDir, "AGENTS.md"))) {
    platforms.push("codex");
  }

  // Copilot: .github/copilot-instructions.md
  if (existsSync(join(projectDir, ".github", "copilot-instructions.md"))) {
    platforms.push("copilot");
  }

  // Gemini CLI: .gemini/ directory
  if (existsSync(join(projectDir, ".gemini"))) {
    platforms.push("gemini-cli");
  }

  return platforms;
}

/** Generate platform-specific integration configs */
export function generatePlatformConfigs(
  projectDir: string,
  platforms: Platform[]
): string[] {
  const generated: string[] = [];

  for (const platform of platforms) {
    switch (platform) {
      case "claude-code":
        generated.push(...generateClaudeCode(projectDir));
        break;
      case "cursor":
        generated.push(...generateCursor(projectDir));
        break;
      case "codex":
        generated.push(...generateCodex(projectDir));
        break;
      case "copilot":
        generated.push(...generateCopilot(projectDir));
        break;
      case "gemini-cli":
        generated.push(...generateGemini(projectDir));
        break;
    }
  }

  return generated;
}

/** Claude Code: Agent Skill + Hooks */
function generateClaudeCode(projectDir: string): string[] {
  const generated: string[] = [];

  // 1. Create AgentLint skill
  const skillDir = join(projectDir, ".claude", "skills", "agentlint");
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: agentlint
description: Verify agent output against project rules defined in .agentlint.yaml and AGENTS.md. Run after code changes to catch constraint violations. Use after completing implementation or before submitting changes.
license: MIT
metadata:
  author: agentlint
  version: "0.1.0"
---

# AgentLint — Constraint Verification

After making code changes, run verification:

\`\`\`bash
npx agentlint check
\`\`\`

If violations are found, fix them before proceeding. Do NOT skip violations.

## When to Run

- After completing any code changes
- Before committing
- When the user says "check", "verify", or "lint"

## Interpreting Results

- **error**: Must fix. Cannot proceed until resolved.
- **warning**: Should fix. Document reason if skipping.
- **info**: Informational. No action required.
`
    );
    generated.push(".claude/skills/agentlint/SKILL.md");
    console.log("  ✓ Created Claude Code skill (.claude/skills/agentlint/)");
  }

  // 2. Create self-protection hook — blocks agent from modifying agentlint rules
  const guardHookPath = join(projectDir, ".claude", "hooks", "agentlint-guard.sh");
  if (!existsSync(guardHookPath)) {
    mkdirSync(join(projectDir, ".claude", "hooks"), { recursive: true });
    writeFileSync(
      guardHookPath,
      `#!/bin/bash
# AgentLint Guard Hook — three-tier file protection for AI agents
#
# 🔒 LOCKED  — agent can NEVER modify (exit 2, hard block)
# 🔑 GATED   — agent CAN modify, but only in default permission mode
#               (Claude Code will prompt human for approval)
# 🔓 OPEN    — agent freely edits, AgentLint verifies the result
#
# This hook only enforces the 🔒 LOCKED tier.
# The 🔑 GATED tier is handled by the agent platform's own permission system
# (e.g. Claude Code default mode asks human to approve Edit/Write).

input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)

# ── 🔒 LOCKED — never modifiable by agents ──
# The guard hook itself (prevents self-disabling)
# Built-in rules live in the npm package, not in the project — already safe
LOCKED=(
  ".claude/hooks/agentlint-guard.sh"
)

for pattern in "\${LOCKED[@]}"; do
  if [[ "$file" == *"$pattern"* ]]; then
    echo "🔒 AgentLint: $file is locked — only humans can modify the guard hook" >&2
    exit 2
  fi
done

# ── 🔑 GATED — agent can propose changes, human approves ──
# These files are not hard-blocked. Instead, the agent platform's permission
# system handles approval (e.g. Claude Code default mode, Cursor approve dialog).
# We just log a warning so the human knows what's happening.
GATED=(
  ".agentlint.yaml"
  ".agentlint/rules/"
  "AGENTS.md"
  "CLAUDE.md"
)

for pattern in "\${GATED[@]}"; do
  if [[ "$file" == *"$pattern"* ]]; then
    echo "🔑 AgentLint: $file is a verification rule — human approval required" >&2
    # exit 0 — let the agent platform's permission system handle approval
    exit 0
  fi
done

# ── 🔓 OPEN — all other files, agent edits freely ──
exit 0
`
    );
    generated.push(".claude/hooks/agentlint-guard.sh");
    console.log("  ✓ Created guard hook (.claude/hooks/agentlint-guard.sh)");
    console.log("    🔒 Locked: guard hook itself (agent can never modify)");
    console.log("    🔑 Gated: .agentlint.yaml, AGENTS.md, rules (agent proposes, human approves)");
  }

  // 3. Merge hooks into existing settings.json
  const settingsPath = join(projectDir, ".claude", "settings.json");

  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      // Check if guard hook already registered
      const preHooks = settings.hooks?.PreToolUse ?? [];
      const hasGuard = preHooks.some(
        (h: Record<string, unknown>) =>
          JSON.stringify(h).includes("agentlint-guard")
      );
      if (!hasGuard) {
        console.log(
          "  · Add to .claude/settings.json PreToolUse hooks:\n" +
          '    {"matcher":"Edit|Write","hooks":[{"type":"command","command":"bash .claude/hooks/agentlint-guard.sh"}]}'
        );
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return generated;
}

/** Cursor: .cursor/rules/ integration */
function generateCursor(projectDir: string): string[] {
  const generated: string[] = [];
  const rulesDir = join(projectDir, ".cursor", "rules");

  if (!existsSync(join(rulesDir, "agentlint.md"))) {
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(
      join(rulesDir, "agentlint.md"),
      `# AgentLint Verification

After making code changes, always run:

\`\`\`bash
npx agentlint check
\`\`\`

Fix all errors before proceeding. Do not skip constraint violations.

This checks your code against the rules defined in \`.agentlint.yaml\` and \`AGENTS.md\`.
`
    );
    generated.push(".cursor/rules/agentlint.md");
    console.log("  ✓ Created Cursor rule (.cursor/rules/agentlint.md)");
  }

  return generated;
}

/** Codex: Append verification instruction to AGENTS.md */
function generateCodex(projectDir: string): string[] {
  const agentsMd = join(projectDir, "AGENTS.md");
  if (existsSync(agentsMd)) {
    const content = readFileSync(agentsMd, "utf-8");
    if (!content.includes("agentlint")) {
      console.log(
        "  · AGENTS.md exists — consider adding: 'After changes, run `npx agentlint check`'"
      );
    }
  }
  return [];
}

/** Copilot: Add to copilot-instructions.md */
function generateCopilot(projectDir: string): string[] {
  const generated: string[] = [];
  const instructionsPath = join(
    projectDir,
    ".github",
    "copilot-instructions.md"
  );

  if (existsSync(instructionsPath)) {
    const content = readFileSync(instructionsPath, "utf-8");
    if (!content.includes("agentlint")) {
      console.log(
        "  · .github/copilot-instructions.md exists — consider adding AgentLint verification step"
      );
    }
  }

  return generated;
}

/** Gemini CLI: .gemini/settings.json */
function generateGemini(projectDir: string): string[] {
  const generated: string[] = [];
  const geminiDir = join(projectDir, ".gemini");

  if (!existsSync(join(geminiDir, "agentlint.md"))) {
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      join(geminiDir, "agentlint.md"),
      `# AgentLint Verification

After making code changes, run \`npx agentlint check\` to verify against project constraints.
Fix all errors before proceeding.
`
    );
    generated.push(".gemini/agentlint.md");
    console.log("  ✓ Created Gemini CLI instruction (.gemini/agentlint.md)");
  }

  return generated;
}
