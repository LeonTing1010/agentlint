import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runChecks } from "../engine/runner.js";
import type { Rule } from "../types.js";

const TMP = join(import.meta.dirname, "../../.test-tmp-runner");

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, "apps", "web", "src"), { recursive: true });
  mkdirSync(join(TMP, "packages", "domain", "src"), { recursive: true });
}

function teardown() {
  rmSync(TMP, { recursive: true, force: true });
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: "test-rule",
    description: "Test rule description",
    severity: "error",
    checker: {
      type: "pattern",
      pattern: "console\\.log",
      mode: "must-not-exist",
    },
    ...overrides,
  };
}

describe("Pattern checker (runner)", () => {
  it("must-not-exist mode: violation when pattern found", async () => {
    setup();
    try {
      const file = join(TMP, "apps", "web", "src", "bad.ts");
      writeFileSync(file, 'console.log("debug");\n');

      const rule = makeRule();
      const result = await runChecks(TMP, [rule], { files: ["apps/web/src/bad.ts"] });

      assert.equal(result.passed, false);
      assert.ok(result.violations.length > 0);
      assert.equal(result.violations[0].ruleId, "test-rule");
    } finally {
      teardown();
    }
  });

  it("must-not-exist mode: no violation when pattern absent", async () => {
    setup();
    try {
      const file = join(TMP, "apps", "web", "src", "good.ts");
      writeFileSync(file, 'const x = 1;\n');

      const rule = makeRule();
      const result = await runChecks(TMP, [rule], { files: ["apps/web/src/good.ts"] });

      assert.equal(result.passed, true);
      assert.equal(result.violations.length, 0);
    } finally {
      teardown();
    }
  });

  it("must-exist mode: violation when pattern absent", async () => {
    setup();
    try {
      const file = join(TMP, "apps", "web", "src", "missing.ts");
      writeFileSync(file, 'const x = 1;\n');

      const rule = makeRule({
        id: "must-exist-rule",
        checker: {
          type: "pattern",
          pattern: "use strict",
          mode: "must-exist",
        },
      });
      const result = await runChecks(TMP, [rule], { files: ["apps/web/src/missing.ts"] });

      assert.equal(result.passed, false);
      assert.ok(result.violations.length > 0);
    } finally {
      teardown();
    }
  });

  it("must-contain mode: violation when pattern absent", async () => {
    setup();
    try {
      const file = join(TMP, "apps", "web", "src", "nocontain.ts");
      writeFileSync(file, 'export function hello() {}\n');

      const rule = makeRule({
        id: "must-contain-rule",
        checker: {
          type: "pattern",
          pattern: "export default",
          mode: "must-contain",
        },
      });
      const result = await runChecks(TMP, [rule], { files: ["apps/web/src/nocontain.ts"] });

      assert.equal(result.passed, false);
      assert.ok(result.violations.length > 0);
    } finally {
      teardown();
    }
  });

  it("scope filtering works correctly", async () => {
    setup();
    try {
      // File inside apps/ — should be checked
      const appFile = join(TMP, "apps", "web", "src", "app.ts");
      writeFileSync(appFile, 'import { prisma } from "@org/database";\n');

      // File inside packages/ — should be excluded from apps/** scope
      const pkgFile = join(TMP, "packages", "domain", "src", "service.ts");
      writeFileSync(pkgFile, 'import { prisma } from "@org/database";\n');

      const rule = makeRule({
        id: "no-prisma-in-apps",
        checker: {
          type: "pattern",
          pattern: "import.*prisma.*from",
          mode: "must-not-exist",
        },
        scope: "apps/**",
      });

      const result = await runChecks(TMP, [rule], {
        files: [
          "apps/web/src/app.ts",
          "packages/domain/src/service.ts",
        ],
      });

      // Only the apps/ file should produce a violation
      assert.equal(result.violations.length, 1);
      assert.ok(result.violations[0].file.includes("apps/web/src/app.ts"));
    } finally {
      teardown();
    }
  });
});
