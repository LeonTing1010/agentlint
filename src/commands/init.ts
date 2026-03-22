import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PondManifest } from "../types.js";
import { detectPlatforms, generatePlatformConfigs } from "../platforms/detect.js";

const DEFAULT_CONFIG = `# .agentlint.yaml — AgentLint configuration
# Docs: https://github.com/LeonTing1010/agentlint

extends:
  - agentlint:recommended

# Auto-extract verifiable rules from AGENTS.md
agents-md:
  enabled: true

# Override rules
# rules:
#   no-db-in-apps: warning
#   some-rule: off

# File scope
# include:
#   - "src/**"
#   - "apps/**"
# exclude:
#   - "node_modules/**"
#   - "dist/**"
`;

interface InitOptions {
  auto?: boolean;
}

export async function init(projectDir: string, options: InitOptions = {}) {
  const manifest: PondManifest = {
    version: "0.1.0",
    installedAt: new Date().toISOString(),
    managedFiles: [],
  };

  console.log("Initializing AgentLint...\n");

  // 1. Create .agentlint.yaml
  const configPath = join(projectDir, ".agentlint.yaml");
  if (!existsSync(configPath)) {
    writeFileSync(configPath, DEFAULT_CONFIG);
    manifest.managedFiles.push(".agentlint.yaml");
    console.log("  ✓ Created .agentlint.yaml");
  } else {
    console.log("  · .agentlint.yaml already exists, skipping");
  }

  // 2. Create .agentlintignore
  const ignorePath = join(projectDir, ".agentlintignore");
  if (!existsSync(ignorePath)) {
    writeFileSync(
      ignorePath,
      `# .agentlintignore — files to skip during agentlint check
# Works like .gitignore — glob patterns, one per line

# Test fixtures and seed data
**/seed.ts
**/seed.js
**/fixtures/**
**/__mocks__/**

# Test files (covered by test runners, not agentlint)
# Uncomment if you want to skip test files:
# **/*.test.*
# **/*.spec.*
# tests/**

# Scripts that check for patterns (would match their own rules)
# scripts/check-*.sh

# Generated files
**/*.generated.*
**/*.g.ts
`
    );
    manifest.managedFiles.push(".agentlintignore");
    console.log("  ✓ Created .agentlintignore");
  }

  // 3. Create .agentlint/rules/ for custom rules
  const rulesDir = join(projectDir, ".agentlint", "rules");
  if (!existsSync(rulesDir)) {
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(
      join(rulesDir, ".gitkeep"),
      "# Add custom rule YAML files here\n"
    );
    manifest.managedFiles.push(".agentlint/rules/.gitkeep");
    console.log("  ✓ Created .agentlint/rules/ (add custom rules here)");
  }

  // 3. Detect platforms and generate integrations
  const platforms = detectPlatforms(projectDir);
  if (platforms.length > 0) {
    console.log(`\n  Detected platforms: ${platforms.join(", ")}`);
    if (options.auto) {
      const generatedFiles = generatePlatformConfigs(projectDir, platforms);
      manifest.managedFiles.push(...generatedFiles);
    } else {
      console.log("  · Run with --auto to register hooks automatically");
      console.log("    npx agentlint init --auto");
    }
  }

  // 4. Check for AGENTS.md
  const agentsMdPaths = [
    join(projectDir, "AGENTS.md"),
    join(projectDir, "CLAUDE.md"),
  ];
  const foundAgentsMd = agentsMdPaths.find((p) => existsSync(p));
  if (foundAgentsMd) {
    console.log(`\n  ✓ Found ${foundAgentsMd.split("/").pop()} — rules will be auto-extracted`);
  } else {
    console.log("\n  · No AGENTS.md found — create one to define rules");
  }

  // 5. Write manifest
  const manifestPath = join(projectDir, ".agentlint", "pond.json");
  mkdirSync(join(projectDir, ".agentlint"), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log("  ✓ Created .agentlint/pond.json (tracks managed files)");

  // Summary
  console.log(`
Done! Next steps:

  npx agentlint check        Run verification
  npx agentlint list-rules   See active rules
  npx agentlint check --staged   Add to pre-commit hook
`);
}
