import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runChecks } from "../engine/runner.js";
import type { Rule } from "../types.js";

const TMP = join(import.meta.dirname, "../../.test-tmp-ignore");

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, "src"), { recursive: true });
  mkdirSync(join(TMP, "fixtures"), { recursive: true });
}

function teardown() {
  rmSync(TMP, { recursive: true, force: true });
}

function makeRule(): Rule {
  return {
    id: "no-console",
    description: "No console.log",
    severity: "error",
    checker: {
      type: "pattern",
      pattern: "console\\.log",
      mode: "must-not-exist",
    },
  };
}

describe(".agentlintignore", () => {
  it("patterns from ignore file are respected", async () => {
    setup();
    try {
      // Create a .agentlintignore that excludes fixtures/
      writeFileSync(join(TMP, ".agentlintignore"), "fixtures/**\n");

      // Create files with violations in both dirs
      writeFileSync(join(TMP, "src", "app.ts"), 'console.log("hello");\n');
      writeFileSync(join(TMP, "fixtures", "data.ts"), 'console.log("fixture");\n');

      const rule = makeRule();
      const result = await runChecks(TMP, [rule], {
        files: ["src/app.ts", "fixtures/data.ts"],
      });

      // Only src/app.ts should have violations; fixtures/data.ts should be ignored
      assert.ok(result.violations.length > 0, "should have violations");
      assert.ok(
        result.violations.every((v) => !v.file.includes("fixtures")),
        "fixtures/ should be ignored"
      );
    } finally {
      teardown();
    }
  });

  it("default excludes (node_modules, .git) always apply", async () => {
    setup();
    try {
      mkdirSync(join(TMP, "node_modules", "pkg"), { recursive: true });
      writeFileSync(
        join(TMP, "node_modules", "pkg", "index.js"),
        'console.log("nm");\n'
      );
      writeFileSync(join(TMP, "src", "main.ts"), 'const x = 1;\n');

      const rule = makeRule();
      const result = await runChecks(TMP, [rule], {
        files: ["node_modules/pkg/index.js", "src/main.ts"],
      });

      // node_modules should be excluded by default
      assert.ok(
        result.violations.every((v) => !v.file.includes("node_modules")),
        "node_modules should always be excluded"
      );
    } finally {
      teardown();
    }
  });
});
