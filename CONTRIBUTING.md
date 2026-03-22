# Contributing to AgentLint

Thank you for your interest in contributing to AgentLint! This guide covers how to add rules, create rule packs, and test locally.

## Adding a Rule

Rules are YAML files in `rules/<category>/`. Each rule defines a constraint that AI agent output must satisfy.

### YAML Format

```yaml
id: no-example-pattern                    # Unique kebab-case ID
name: No Example Pattern                  # Human-readable name
description: >
  Description of what this rule enforces and why.
severity: error                           # error | warning | info
category: security                        # layering | security | consistency | safety | custom
tags: [security, example]                 # Free-form tags for filtering

scope:
  include: ["src/**", "apps/**"]          # Glob patterns for target files
  exclude: ["**/*.test.*"]                # Glob patterns to skip

checker:
  type: pattern                           # pattern | command | composite
  pattern: "dangerous\\.function\\("     # Regex to search for
  mode: must-not-exist                    # must-not-exist | must-exist | must-contain

docs:
  rationale: >
    Why this rule exists.
  fix: >
    How to fix a violation.
  examples:
    incorrect: |
      dangerous.function("foo")
    correct: |
      safe.function("foo")
```

### Required Fields

- `id` -- kebab-case, unique, max 64 characters
- `description` -- what the rule enforces, max 512 characters
- `severity` -- `error` (blocks CI), `warning` (should fix), `info` (informational)
- `checker` -- how to verify (see Checker Types below)

### Checker Types

**Pattern** -- regex-based matching (like grep):
```yaml
checker:
  type: pattern
  pattern: "import.*prisma.*from"
  mode: must-not-exist          # violation if found
  target: content               # content | filename | path
```

**Command** -- external script:
```yaml
checker:
  type: command
  command: "bash scripts/check-something.sh"
  timeout: 30
```

**Composite** -- combine checkers:
```yaml
checker:
  type: composite
  operator: and                 # and | or | not
  checkers:
    - type: pattern
      pattern: "functionA"
      mode: must-exist
    - type: pattern
      pattern: "functionB"
      mode: must-exist
```

### Steps to Add a Rule

1. Create a YAML file in the appropriate directory:
   - `rules/recommended/` for general best practices
   - `rules/security/` for security rules
   - `.agentlint/rules/` for project-specific rules
2. Follow the YAML format above
3. Test it locally (see below)
4. Submit a pull request

## Creating a Rule Pack

A rule pack is a distributable npm package containing rules.

### Directory Structure

```
my-rule-pack/
├── package.json
├── rules/
│   ├── rule-one.yaml
│   ├── rule-two.yaml
│   └── rule-three.yaml
└── README.md
```

### package.json

```json
{
  "name": "@yourorg/agentlint-rules-yourpack",
  "version": "1.0.0",
  "keywords": ["agentlint-rules"],
  "main": "rules/",
  "files": ["rules/"]
}
```

### Usage

Users reference your pack in `.agentlint.yaml`:

```yaml
extends:
  - @yourorg/agentlint-rules-yourpack
```

## Testing Locally

### Prerequisites

- Node.js >= 18
- npm

### Setup

```bash
git clone https://github.com/LeonTing1010/agentlint.git
cd agentlint
npm install
```

### Build and Test

```bash
# Build TypeScript
npm run build

# Run tests
npm test

# Build + test in one step
npm run test:build
```

### Test a Rule Manually

```bash
# Build first
npm run build

# Run against current directory
node dist/cli.js check

# Run against a specific project
node dist/cli.js check --format json

# List all loaded rules
node dist/cli.js list-rules
```

### Testing a New Rule

1. Add your rule YAML to `rules/<category>/`
2. Create a test file with content that should trigger the rule
3. Run `node dist/cli.js check` and verify the violation appears
4. Run `node dist/cli.js check` against clean code and verify no false positives

## Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-rule`
3. Make your changes
4. Build: `npm run build`
5. Test: `npm test`
6. Commit: `git commit -m "feat: add my-rule"`
7. Push and open a pull request

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
