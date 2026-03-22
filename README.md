# AgentLint

> **AGENTS.md defines the rules. AgentLint enforces them.**

AI coding agents are probabilistic. They hallucinate, skip steps, and break conventions. Your `AGENTS.md` tells them the rules — but nobody checks if they followed them.

AgentLint is the verification layer for the AI agent ecosystem. It turns natural language rules into deterministic checks.

```
AGENTS.md   →  "NEVER import prisma directly in apps/"
                    ↓
AgentLint   →  Scans code, finds violation, blocks commit
```

## How It Works

```bash
# Install
npm install -D agentlint

# Initialize — auto-detects AGENTS.md and generates config
npx agentlint init

# Check — runs all rules against your code
npx agentlint check
```

AgentLint reads rules from three sources:

```yaml
# .agentlint.yaml
extends:
  - agentlint:recommended        # Built-in rules (architecture, security)
  - @community/nextjs            # Community rule packs
rules:                            # Your project-specific rules
  no-db-in-apps: error
agents-md: true                   # Auto-extract rules from AGENTS.md
```

## AGENTS.md Integration

AgentLint parses your `AGENTS.md` and extracts verifiable rules automatically:

```markdown
<!-- Your AGENTS.md -->
- NEVER import `prisma` directly in `apps/` — use domain services
- ALWAYS use `apiSuccess()` in API routes, never raw `NextResponse.json()`
- GET handlers must NOT contain write operations
```

AgentLint turns these into enforceable checks — no extra configuration needed.

## Write a Rule in 30 Seconds

```yaml
# rules/no-db-in-apps.yaml
id: no-db-in-apps
description: Apps must not import database client directly
severity: error
category: layering
checker:
  type: pattern
  pattern: "import.*prisma.*from"
  mode: must-not-exist
scope: "apps/**"
docs:
  fix: Import from @your-org/domain instead
```

## Use as an Agent Skill

AgentLint works inside AI agents as a standard [Agent Skill](https://agentskills.io):

```
.claude/skills/agentlint/SKILL.md
```

After installing, your agent automatically verifies its own output:

```
Agent writes code
  → AgentLint skill runs
  → Violation found
  → Agent fixes it
  → AgentLint passes
  → Done (verified, not just "I think I'm done")
```

## Use in CI / Pre-commit

```bash
# Pre-commit hook
npx agentlint check --staged

# CI pipeline
npx agentlint check --format json
```

## Rule Packs

Shareable rule collections, distributed as npm packages:

| Pack | Rules | Description |
|------|-------|-------------|
| `agentlint:recommended` | 15+ | Universal architecture & safety rules |
| `agentlint:security` | 10+ | Based on OWASP Agentic Top 10 |
| `@community/nextjs` | — | Next.js specific conventions |
| `@community/fastapi` | — | FastAPI specific conventions |

### Create a Rule Pack

```
my-rules/
├── package.json    # { "keywords": ["agentlint-rules"] }
└── rules/
    ├── my-rule-1.yaml
    └── my-rule-2.yaml
```

```bash
npm publish  # Share with the community
```

## Checker Types

| Type | Precision | Use When |
|------|-----------|----------|
| `pattern` | Regex grep | Simple text matching |
| `ast` | Tree-sitter | Language-aware, no false positives |
| `command` | External script | Complex logic, external tools |
| `composite` | Combine checkers | AND/OR/NOT rule composition |

## Ecosystem Compatibility

AgentLint doesn't compete with existing standards — it complements them:

| Standard | What it does | AgentLint's role |
|----------|-------------|-----------------|
| [AGENTS.md](https://agents.md) | Defines rules for agents | **Enforces them** |
| [Agent Skills](https://agentskills.io) | Reusable agent capabilities | AgentLint is a verification skill |
| [MCP](https://modelcontextprotocol.io) | Agent ↔ tool connection | AgentLint checks MCP tool outputs |
| [OWASP Agentic Top 10](https://genai.owasp.org) | Security risk framework | Built-in security rule pack |
| [AI Coding Rules](https://aicodingrules.org) | Rule format standard | Compatible rule format |

## Why AgentLint Exists

The AI agent ecosystem has creation, discovery, installation, and execution of skills. What it doesn't have is **verification**.

Everyone is building agent capabilities. Nobody is building agent accountability.

> *"The correctness of a system must not depend on the reliability of any single entity — human or AI."*

AgentLint makes AI agent output trustworthy through deterministic, layered verification.

## Specification

See [Rule Specification v0.1](spec/rule-spec.md) for the complete rule format.

## Contributing

The easiest way to contribute is to add a rule from a real bug you've encountered:

```yaml
# "We got burned by X, so now we check for it"
id: descriptive-name
description: What went wrong and what to check
severity: error
checker:
  type: pattern
  pattern: "the pattern that caused the bug"
  mode: must-not-exist
  scope: "where/it/happened/**"
```

Every rule in AgentLint was born from a real incident. Yours should be too.

## License

MIT
