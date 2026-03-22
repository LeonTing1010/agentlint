import { readFileSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { PondManifest } from "../types.js";

export async function uninstall(projectDir: string) {
  const manifestPath = join(projectDir, ".agentlint", "pond.json");

  if (!existsSync(manifestPath)) {
    console.log("AgentLint is not installed in this project.");
    return;
  }

  const manifest: PondManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  console.log("Removing AgentLint...\n");

  // Remove managed files (reverse order to handle nested dirs)
  const sorted = [...manifest.managedFiles].sort().reverse();
  for (const file of sorted) {
    const absPath = join(projectDir, file);
    if (existsSync(absPath)) {
      try {
        unlinkSync(absPath);
        console.log(`  ✗ Removed ${file}`);
      } catch {
        // Might be a directory
        try {
          rmdirSync(absPath);
          console.log(`  ✗ Removed ${file}/`);
        } catch {
          console.log(`  · Could not remove ${file} (may have user content)`);
        }
      }
    }
  }

  // Remove .agentlint.yaml
  const configPath = join(projectDir, ".agentlint.yaml");
  if (existsSync(configPath)) {
    unlinkSync(configPath);
    console.log("  ✗ Removed .agentlint.yaml");
  }

  // Remove .agentlint/pond.json
  unlinkSync(manifestPath);
  console.log("  ✗ Removed .agentlint/pond.json");

  // Try to remove .agentlint/ dir if empty
  const agentlintDir = join(projectDir, ".agentlint");
  try {
    rmdirSync(agentlintDir);
    console.log("  ✗ Removed .agentlint/");
  } catch {
    console.log("  · Kept .agentlint/ (contains custom rules)");
  }

  console.log("\nAgentLint removed. Your custom rules in .agentlint/rules/ were preserved.");
}
