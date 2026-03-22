# AgentLint Rule Specification v0.1

> The standard format for defining verification rules that constrain AI coding agent output.

## Overview

An AgentLint rule is a declarative definition of a constraint that AI agent output must satisfy. Rules are written in YAML with an optional Markdown body for documentation.

AgentLint rules are complementary to existing standards:
- **AGENTS.md** defines what agents should do (instructions)
- **AgentLint rules** verify that agents did it correctly (enforcement)

## Rule File Format

Each rule is a single YAML file (`.yaml` or `.yml`) with the following structure:

```yaml
# Required fields
id: no-db-in-apps                    # Unique identifier (kebab-case, max 64 chars)
description: >
  Application layer must not import database client directly.
  Use domain services instead.
severity: error                       # error | warning | info

# Checker — how to verify (at least one required)
checker:
  type: pattern                       # pattern | ast | command | composite
  # ... checker-specific fields

# Optional fields
category: layering                    # layering | security | consistency | safety | custom
tags: [architecture, separation-of-concerns]
docs:
  rationale: >
    Direct DB access in apps bypasses domain validation,
    enabling inconsistent writes and data corruption.
  fix: >
    Import from @your-org/domain instead of @your-org/database.
  references:
    - https://your-docs.com/architecture
```

## Required Fields

### `id`

- Type: `string`
- Format: kebab-case, lowercase, max 64 characters
- Must be unique within a rule pack
- Examples: `no-db-in-apps`, `get-handler-readonly`, `mask-phone-numbers`

### `description`

- Type: `string`
- Max 512 characters
- Describes what the rule enforces and why
- Should be understandable without reading the full docs

### `severity`

- Type: `enum`
- Values:
  - `error` — violation must be fixed, blocks CI
  - `warning` — should be fixed, does not block
  - `info` — informational, logged but never blocks

### `checker`

Defines how the rule is verified. See [Checker Types](#checker-types).

## Optional Fields

### `category`

Predefined categories for organizing rules:

| Category | Description |
|----------|-------------|
| `layering` | Architecture layer boundaries |
| `security` | Sensitive data, authentication, authorization |
| `consistency` | Single source of truth, no hardcoded values |
| `safety` | Dangerous patterns (write in GET, force push) |
| `custom` | Project-specific rules |

### `tags`

Array of strings for filtering and discovery. Free-form, no predefined values.

### `scope`

Glob pattern(s) limiting which files this rule applies to:

```yaml
scope: "apps/**"                      # Single pattern
scope:                                 # Multiple patterns
  include: ["apps/**", "packages/**"]
  exclude: ["**/*.test.ts", "**/*.spec.ts"]
```

If omitted, the rule applies to all files.

### `docs`

Extended documentation:

```yaml
docs:
  rationale: Why this rule exists
  fix: How to resolve a violation
  references:
    - URL to relevant documentation
  examples:
    correct: |
      import { userService } from '@org/domain'
    incorrect: |
      import { prisma } from '@org/database'
```

## Checker Types

### `pattern` — Regex-based matching (simplest, like grep)

```yaml
checker:
  type: pattern
  pattern: "import.*prisma.*from"     # Regex pattern to search for
  mode: must-not-exist                # must-not-exist | must-exist | must-contain
  target: content                     # content | filename | path
```

**Modes:**
- `must-not-exist` — violation if pattern IS found (default)
- `must-exist` — violation if pattern is NOT found
- `must-contain` — file matching `scope` must contain the pattern

### `ast` — AST-based analysis (precise, language-aware)

```yaml
checker:
  type: ast
  language: typescript                # typescript | javascript | python | go
  query: |
    (import_statement
      source: (string) @source
      (#match? @source "prisma"))
  mode: must-not-exist
```

Uses tree-sitter queries for language-aware analysis. More precise than pattern matching — won't match comments or strings.

### `command` — External command (most flexible)

```yaml
checker:
  type: command
  command: "bash scripts/check-architecture.sh"
  timeout: 30                         # seconds, default 30
  # Exit code 0 = pass, non-zero = fail
  # Stdout is captured as violation message
```

For rules that need complex logic, database checks, or external tool integration.

### `composite` — Combine multiple checkers (logical operators)

```yaml
checker:
  type: composite
  operator: and                       # and | or | not
  checkers:
    - type: pattern
      pattern: "executeSwap|applySwap"
      mode: must-exist
      scope: "packages/domain/src/swap/**"
    - type: pattern
      pattern: "priceDelta|recalculate"
      mode: must-exist
      scope: "packages/domain/src/swap/**"
```

## Configuration File (.agentlint.yaml)

Project-level configuration:

```yaml
# .agentlint.yaml

# Inherit from rule packs
extends:
  - agentlint:recommended            # Built-in recommended rules
  - agentlint:security               # OWASP-based security rules
  - @community/nextjs                # Community rule pack for Next.js
  - ./my-rules/                       # Local directory of rule files

# Override severity or disable specific rules
rules:
  no-db-in-apps: error                # Override severity
  get-handler-readonly: warning       # Downgrade to warning
  some-rule-id: off                   # Disable entirely

# Auto-extract verifiable rules from AGENTS.md
agents-md:
  enabled: true                       # Parse AGENTS.md for enforceable rules
  path: ./AGENTS.md                   # Default: project root

# File patterns to check
include:
  - "src/**"
  - "apps/**"
  - "packages/**"
exclude:
  - "node_modules/**"
  - "dist/**"
  - "**/*.test.*"
```

## Rule Pack Format

A rule pack is a distributable collection of rules:

```
my-rule-pack/
├── package.json          # npm package metadata
│   {
│     "name": "@org/agentlint-rules-nextjs",
│     "keywords": ["agentlint-rules"],
│     "main": "rules/"
│   }
├── rules/
│   ├── no-db-in-apps.yaml
│   ├── get-handler-readonly.yaml
│   └── mask-sensitive-data.yaml
└── README.md
```

Rule packs are distributed as npm packages with the `agentlint-rules` keyword. They can be installed via:

```bash
npm install -D @org/agentlint-rules-nextjs
```

And referenced in `.agentlint.yaml`:

```yaml
extends:
  - @org/agentlint-rules-nextjs
```

## AGENTS.md Integration

AgentLint can parse AGENTS.md files and extract verifiable rules automatically.

Supported patterns in AGENTS.md:

| AGENTS.md Pattern | Extracted Rule |
|-------------------|---------------|
| "NEVER import X from Y" | `pattern` checker, `must-not-exist` |
| "ALWAYS use X for Y" | `pattern` checker, `must-exist` |
| "Files in X must contain Y" | `pattern` checker with `scope` |
| "X is forbidden in Y" | `pattern` checker, `must-not-exist` |

Example:

```markdown
<!-- AGENTS.md -->
## Rules
- NEVER import `prisma` directly in `apps/` — use domain services
- ALWAYS use `apiSuccess()`/`apiError()` in API routes, never raw `NextResponse.json()`
```

AgentLint extracts:

```yaml
# Auto-generated from AGENTS.md
- id: agents-md-1
  description: "NEVER import prisma directly in apps/"
  checker:
    type: pattern
    pattern: "import.*prisma"
    mode: must-not-exist
  scope: "apps/**"
```

## Skill Integration

AgentLint provides a skill compatible with the Agent Skills specification:

```yaml
# .claude/skills/agentlint/SKILL.md
---
name: agentlint
description: >
  Verify agent output against project rules defined in .agentlint.yaml
  and AGENTS.md. Run after code changes to catch violations before commit.
  Use when finishing implementation or before submitting a PR.
license: MIT
metadata:
  author: agentlint
  version: "0.1.0"
---
```

When invoked as a skill, AgentLint:
1. Loads rules from `.agentlint.yaml` + `AGENTS.md`
2. Runs all applicable checkers against changed files
3. Reports violations with fix suggestions
4. Returns structured results the agent can act on

## Hook Integration

AgentLint hooks into the agent lifecycle via Claude Code hooks:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "npx agentlint check-file $FILE_PATH"
      }]
    }],
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "npx agentlint check --staged --quiet"
      }]
    }]
  }
}
```

## CLI Interface

```bash
# Check all files against all rules
npx agentlint check

# Check only staged files (for pre-commit)
npx agentlint check --staged

# Check specific files
npx agentlint check src/api.ts src/service.ts

# Output formats
npx agentlint check --format terminal     # Human-readable (default)
npx agentlint check --format json          # Machine-readable (CI)

# Initialize configuration
npx agentlint init                         # Generate .agentlint.yaml

# Extract rules from AGENTS.md
npx agentlint extract-rules               # Parse AGENTS.md → rule files

# Validate rule files
npx agentlint validate rules/             # Check rule YAML syntax

# List active rules
npx agentlint list-rules                  # Show all loaded rules
```

## Versioning

This specification follows Semantic Versioning:
- **Major**: Breaking changes to rule format
- **Minor**: New optional fields, new checker types
- **Patch**: Clarifications, typo fixes

Current version: **0.1.0**

## Design Principles

1. **Declarative over imperative** — Rules describe WHAT to check, not HOW to check
2. **Compatible, not competing** — Works with AGENTS.md, Agent Skills, AI Coding Rules
3. **Gradual adoption** — Start with one rule, add more over time
4. **Convention over configuration** — Sensible defaults, override when needed
5. **Deterministic** — Same input always produces same output (unlike LLM self-assessment)
