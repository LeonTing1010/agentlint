# Agent Pond

> Verification infrastructure for AI coding agents.
> Skills tell agents what to do. **Pond tells agents what not to do — and proves they did it right.**

AI coding agents (Claude Code, Cursor, Codex, Copilot) are probabilistic. They hallucinate, skip steps, and break conventions. Agent Pond is the deterministic safety net — a layered verification system that catches what LLMs miss.

## The Problem

You run an AI agent. It writes code. How do you know it's correct?

- The agent says "I'm done" — but LLM self-assessment is unreliable (A2: probabilistic)
- You review manually — but your working memory is ~7 items (A1: human limitation)
- You have tests — but they only check what you told them to check (A3: machine incompleteness)

**No single entity — human or AI — is reliable enough to trust alone.**

## The Solution: Layered Verification

Agent Pond provides four layers that work together:

```
Layer 1: Skills     — Deterministic workflows (how to do things)
Layer 2: Hooks      — Automatic guardrails (what NOT to do)
Layer 3: Guards     — Architecture & convention checks (did you follow the rules?)
Layer 4: Templates  — CLAUDE.md / project scaffolding (what are the rules?)
```

Each layer catches what the others miss:

| Layer | Catches | Example |
|-------|---------|---------|
| **Skills** | Inconsistent process | Agent debugs differently each time → always hypothesis-driven |
| **Hooks** | Dangerous actions | Agent edits .env file → blocked before execution |
| **Guards** | Convention violations | Agent imports DB in app layer → pre-commit rejects |
| **Templates** | Missing context | Agent doesn't know your architecture → CLAUDE.md tells it |

## Quick Start

```bash
# Initialize Agent Pond in your project
npx agent-pond init

# Choose your stack
npx agent-pond init --stack next-monorepo
npx agent-pond init --stack python-fastapi
npx agent-pond init --stack node-express
```

This generates:

```
your-project/
├── .claude/
│   ├── skills/           # 11 production-tested workflow skills
│   │   ├── verify/       # Multi-gate verification
│   │   ├── systematic-debugging/
│   │   ├── writing-plans/
│   │   ├── executing-plans/
│   │   └── ...
│   ├── hooks/            # Automatic guardrails
│   │   ├── block-sensitive-files.sh
│   │   ├── notify-on-complete.sh
│   │   └── update-tab-status.sh
│   └── settings.json     # Hook registrations
├── scripts/
│   └── check-architecture.sh  # Pluggable guard rules
└── CLAUDE.md             # Project conventions template
```

## Skills (Layer 1)

Production-tested workflow skills, compatible with the [Agent Skills](https://agentskills.io) open standard (works across Claude Code, Cursor, Codex, Copilot, and 30+ tools).

| Skill | What it does |
|-------|-------------|
| `verify` | Multi-layer verification gates — typecheck, architecture, lint, tests |
| `systematic-debugging` | Hypothesis-driven bug investigation with root cause analysis |
| `writing-plans` | Intent-verification pairs, tasks split by change isolation |
| `executing-plans` | Execute plans with built-in verify loops |
| `subagent-driven-development` | Parallel multi-agent development with dual review |
| `dispatching-parallel-agents` | Parallel investigation of independent issues |
| `brainstorming` | Structured design discussion — diverge, weigh, converge |
| `test-driven-development` | Red-green-refactor with tests as verification criteria |
| `run-task` | Semi-autonomous task execution with worktree isolation |
| `using-git-worktrees` | Isolated workspaces for parallel development |
| `using-skills` | Auto-router that matches intent to the right skill |

## Hooks (Layer 2)

Hooks intercept agent actions automatically. They run as shell scripts triggered by Claude Code events.

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "bash .claude/hooks/block-sensitive-files.sh"
      }]
    }]
  }
}
```

**Built-in hooks:**

| Hook | Event | What it does |
|------|-------|-------------|
| `block-sensitive-files` | PreToolUse | Blocks edits to .env, credentials, lock files |
| `notify-on-complete` | Notification | Desktop notification when agent finishes or needs approval |
| `update-tab-status` | PostToolUse / Stop | Updates terminal tab title with current activity |

## Guards (Layer 3)

Guards are pluggable architecture rules. Each rule is a simple declaration:

```yaml
# rules/no-db-in-apps.yaml
name: no-direct-db-access
severity: error
pattern: "import.*prisma.*from"
scope: "apps/**"
message: "Apps must not import prisma directly. Use domain services."
```

Run all guards:

```bash
npx agent-pond check          # Run all guards
npx agent-pond check --staged # Only check staged files (pre-commit)
```

**Built-in guard categories:**

| Category | Rules | Examples |
|----------|-------|---------|
| **Layering** | No cross-layer imports | Apps can't import DB, domain can't import HTTP |
| **Security** | No exposed secrets | No raw phone numbers in API responses |
| **Consistency** | Single source of truth | No hardcoded rates, thresholds, or status labels |
| **Safety** | No dangerous patterns | No `await` writes in GET handlers |

## Templates (Layer 4)

CLAUDE.md templates provide project context to AI agents. Choose a template for your stack:

```bash
npx agent-pond template list
npx agent-pond template apply next-monorepo
```

Templates include:
- Project structure conventions
- Layer responsibilities and boundaries
- Common commands (dev, build, test, deploy)
- Forbidden patterns with explanations

## Philosophy

Agent Pond is built on two principles derived from first-principles reasoning:

> **1. No single entity — human or AI — is reliable enough to trust alone.**
>
> Humans forget (A1). LLMs hallucinate (A2). Machines only check what they're told (A3).
> Therefore: cross-validate across independent layers.

> **2. Every correctness claim has an expiration date.**
>
> The world changes independently (T1). Rules expire (T2). Systems don't know they're wrong (T3).
> Therefore: audit and refresh, don't just accumulate.

### Verification Strength Ladder

Stronger verification is always preferred:

```
Type system  >  Unit tests  >  AST/ESLint  >  grep  >  Documentation
(compile-time)  (runtime)     (static)       (weak)   (no enforcement)
```

A rule at the grep level should be promoted to types or tests when possible.

### Knowledge Lifecycle

Rules are not static. They follow a cycle:

```
Implicit (in someone's head)
  → Explicit (written down)
  → Constraint (machine-checkable)
  → Guarded (CI blocks violations)
  → Expired (world changed, rule is wrong)
  → Re-examined → ...
```

Agent Pond helps you push rules from implicit → guarded, and reminds you to audit for expiration.

## Contributing

The easiest way to contribute is to add a guard rule from your own experience:

```yaml
# rules/your-rule.yaml
name: descriptive-name
severity: error | warning
pattern: "regex pattern"
scope: "glob/pattern/**"
message: "Why this is wrong and what to do instead."
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Community

- [GitHub Discussions](https://github.com/LeonTing1010/agent-pond/discussions) — questions, ideas, show & tell
- [Issues](https://github.com/LeonTing1010/agent-pond/issues) — bug reports, feature requests

## License

MIT

---

*Built from production experience at [TTLP](https://github.com/LeonTing1010/TTLP) — a food subscription platform where AI agents handle everything from menu generation to procurement workflows. Every rule in Agent Pond was learned from a real bug.*
