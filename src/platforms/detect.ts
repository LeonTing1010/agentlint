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

  // 3. Auto-register hooks into settings.json
  const settingsPath = join(projectDir, ".claude", "settings.json");
  const agentlintHooks = {
    // Guard: block edits to locked files
    PreToolUse: {
      matcher: "Edit|Write",
      hooks: [{
        type: "command",
        command: "bash $CLAUDE_PROJECT_DIR/.claude/hooks/agentlint-guard.sh",
        timeout: 3,
      }],
    },
    // Stop: run check after agent completes, inject results as context (non-blocking)
    Stop: {
      matcher: "",
      hooks: [{
        type: "command",
        command: "bash $CLAUDE_PROJECT_DIR/.claude/hooks/agentlint-check.sh",
        timeout: 30,
      }],
    },
  };

  // Create the check hook script (non-blocking — informs agent, doesn't stop it)
  const checkHookPath = join(projectDir, ".claude", "hooks", "agentlint-check.sh");
  if (!existsSync(checkHookPath)) {
    writeFileSync(
      checkHookPath,
      `#!/bin/bash
# AgentLint Check Hook — runs after agent completes a response
# Non-blocking: results are injected as context for the next turn
# Agent sees violations and can choose to fix them
# Real blocking happens at pre-commit, not here

result=$(npx agentlint check --staged --quiet --format json 2>/dev/null)
errors=$(echo "$result" | grep -o '"severity":"error"' 2>/dev/null | wc -l | tr -d ' ')
warnings=$(echo "$result" | grep -o '"severity":"warning"' 2>/dev/null | wc -l | tr -d ' ')

if [ "$errors" -gt 0 ] || [ "$warnings" -gt 0 ]; then
  # Output as JSON for Claude Code to inject as context
  cat <<ENDJSON
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "AgentLint found $errors error(s) and $warnings warning(s) in staged files. Run 'npx agentlint check' to see details. Errors must be fixed before commit."
  }
}
ENDJSON
fi

# Always exit 0 — never block the agent, just inform
exit 0
`
    );
    generated.push(".claude/hooks/agentlint-check.sh");
    console.log("  ✓ Created check hook (.claude/hooks/agentlint-check.sh)");
    console.log("    → Runs after agent response, informs but doesn't block");
  }

  try {
    let settings: Record<string, unknown> = {};
    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    }

    if (!settings.hooks) settings.hooks = {};
    const hooks = settings.hooks as Record<string, unknown[]>;
    let changed = false;

    // Register PreToolUse guard
    if (!hooks.PreToolUse) hooks.PreToolUse = [];
    const hasGuard = (hooks.PreToolUse as unknown[]).some(
      (h) => JSON.stringify(h).includes("agentlint-guard")
    );
    if (!hasGuard) {
      (hooks.PreToolUse as unknown[]).push(agentlintHooks.PreToolUse);
      changed = true;
    }

    // Register Stop check
    if (!hooks.Stop) hooks.Stop = [];
    const hasCheck = (hooks.Stop as unknown[]).some(
      (h) => JSON.stringify(h).includes("agentlint-check")
    );
    if (!hasCheck) {
      (hooks.Stop as unknown[]).push(agentlintHooks.Stop);
      changed = true;
    }

    if (changed) {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
      console.log("  ✓ Registered hooks in .claude/settings.json");
      console.log("    → PreToolUse: guard (blocks locked file edits)");
      console.log("    → Stop: check (informs agent of violations)");
    } else {
      console.log("  · AgentLint hooks already registered");
    }
  } catch {
    console.log("  · Could not update .claude/settings.json — add hooks manually");
  }

  return generated;
}

/** Cursor: .cursor/rules/ + .cursor/hooks.json */
function generateCursor(projectDir: string): string[] {
  const generated: string[] = [];

  // 1. Cursor rule (context for the agent)
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

  // 2. Cursor hooks.json (auto-run after file edit)
  const hooksPath = join(projectDir, ".cursor", "hooks.json");
  try {
    let hooksConfig: Record<string, unknown> = { version: 1, hooks: {} };
    if (existsSync(hooksPath)) {
      hooksConfig = JSON.parse(readFileSync(hooksPath, "utf-8"));
    }
    const hooks = (hooksConfig.hooks ?? {}) as Record<string, unknown>;
    if (!hooks.afterFileEdit || !JSON.stringify(hooks.afterFileEdit).includes("agentlint")) {
      hooks.afterFileEdit = [
        ...(Array.isArray(hooks.afterFileEdit) ? hooks.afterFileEdit : []),
        {
          command: "npx agentlint check --staged --quiet",
          description: "AgentLint: verify against project constraints",
        },
      ];
      hooksConfig.hooks = hooks;
      writeFileSync(hooksPath, JSON.stringify(hooksConfig, null, 2) + "\n");
      generated.push(".cursor/hooks.json");
      console.log("  ✓ Registered Cursor hook (.cursor/hooks.json → afterFileEdit)");
    }
  } catch {
    console.log("  · Could not update .cursor/hooks.json");
  }

  return generated;
}

/** Codex CLI: hooks + AGENTS.md */
function generateCodex(projectDir: string): string[] {
  const generated: string[] = [];

  // 1. Codex hooks (experimental — .codex/hooks.json)
  const codexHooksDir = join(projectDir, ".codex");
  const codexHooksPath = join(codexHooksDir, "hooks.json");
  if (!existsSync(codexHooksPath)) {
    mkdirSync(codexHooksDir, { recursive: true });
    writeFileSync(
      codexHooksPath,
      JSON.stringify({
        hooks: {
          Stop: [{
            command: "npx agentlint check --staged --quiet",
            description: "AgentLint: verify after response",
          }],
        },
      }, null, 2) + "\n"
    );
    generated.push(".codex/hooks.json");
    console.log("  ✓ Created Codex hooks (.codex/hooks.json → Stop)");
  }

  // 2. Append verification section to AGENTS.md if not present
  const agentsMd = join(projectDir, "AGENTS.md");
  if (existsSync(agentsMd)) {
    const content = readFileSync(agentsMd, "utf-8");
    if (!content.includes("agentlint")) {
      const section = `
## Verification

After making code changes, run:

\`\`\`bash
npx agentlint check
\`\`\`

Fix all errors before committing. This checks against rules in \`.agentlint.yaml\`.
`;
      writeFileSync(agentsMd, content + section);
      console.log("  ✓ Appended verification section to AGENTS.md");
    }
  }

  return generated;
}

/** Copilot: .github/hooks/ + copilot-instructions.md */
function generateCopilot(projectDir: string): string[] {
  const generated: string[] = [];

  // 1. Copilot hooks (.github/hooks/agentlint.json)
  const hooksDir = join(projectDir, ".github", "hooks");
  const hookFile = join(hooksDir, "agentlint.json");
  if (!existsSync(hookFile)) {
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      hookFile,
      JSON.stringify({
        hooks: [{
          event: "postToolUse",
          command: "npx agentlint check --staged --quiet",
          description: "AgentLint: verify agent output against project constraints",
        }],
      }, null, 2) + "\n"
    );
    generated.push(".github/hooks/agentlint.json");
    console.log("  ✓ Created Copilot hook (.github/hooks/agentlint.json → postToolUse)");
  }

  // 2. Add to copilot-instructions.md
  const instructionsPath = join(projectDir, ".github", "copilot-instructions.md");
  if (existsSync(instructionsPath)) {
    const content = readFileSync(instructionsPath, "utf-8");
    if (!content.includes("agentlint")) {
      writeFileSync(
        instructionsPath,
        content + "\n## Verification\n\nAfter code changes, run `npx agentlint check`. Fix all errors before committing.\n"
      );
      console.log("  ✓ Appended verification section to copilot-instructions.md");
    }
  }

  return generated;
}

/** Gemini CLI: .gemini/ instruction */
function generateGemini(projectDir: string): string[] {
  const generated: string[] = [];
  const geminiDir = join(projectDir, ".gemini");

  if (!existsSync(join(geminiDir, "agentlint.md"))) {
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      join(geminiDir, "agentlint.md"),
      `# AgentLint Verification

After making code changes, run \`npx agentlint check\` to verify against project constraints.
Fix all errors before proceeding. Do not skip constraint violations.

This checks your code against the rules defined in \`.agentlint.yaml\` and \`AGENTS.md\`.
`
    );
    generated.push(".gemini/agentlint.md");
    console.log("  ✓ Created Gemini CLI instruction (.gemini/agentlint.md)");
    // Gemini CLI doesn't have hooks yet — instruction file is the best we can do
  }

  return generated;
}
