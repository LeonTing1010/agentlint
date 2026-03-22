import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadRulesFromDir } from "../engine/loader.js";

const TMP = join(import.meta.dirname, "../../.test-tmp-loader");

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
}

function teardown() {
  rmSync(TMP, { recursive: true, force: true });
}

describe("YAML rule loader", () => {
  it("loads a valid rule YAML and returns correct Rule object", () => {
    setup();
    try {
      const yaml = `id: test-rule
description: A test rule
severity: error
category: security
tags:
  - test
  - example
checker:
  type: pattern
  pattern: "console\\.log"
  mode: must-not-exist
scope:
  include: ["src/**"]
`;
      writeFileSync(join(TMP, "test-rule.yaml"), yaml);
      const rules = loadRulesFromDir(TMP);

      assert.equal(rules.length, 1);
      assert.equal(rules[0].id, "test-rule");
      assert.equal(rules[0].description, "A test rule");
      assert.equal(rules[0].severity, "error");
      assert.equal(rules[0].category, "security");
      assert.deepEqual(rules[0].tags, ["test", "example"]);
      assert.equal(rules[0].checker.type, "pattern");
      if (rules[0].checker.type === "pattern") {
        assert.equal(rules[0].checker.pattern, "console\\.log");
        assert.equal(rules[0].checker.mode, "must-not-exist");
      }
    } finally {
      teardown();
    }
  });

  it("skips invalid YAML (missing required fields)", () => {
    setup();
    try {
      // Missing 'severity' — should be skipped
      const yaml = `id: incomplete-rule
description: Missing severity
checker:
  type: pattern
  pattern: "foo"
`;
      writeFileSync(join(TMP, "bad.yaml"), yaml);
      const rules = loadRulesFromDir(TMP);

      assert.equal(rules.length, 0);
    } finally {
      teardown();
    }
  });

  it("handles inline arrays (tags: [a, b, c])", () => {
    setup();
    try {
      const yaml = `id: inline-tags
description: Rule with inline tags
severity: warning
tags: [alpha, beta, gamma]
checker:
  type: pattern
  pattern: "todo"
  mode: must-not-exist
`;
      writeFileSync(join(TMP, "inline.yaml"), yaml);
      const rules = loadRulesFromDir(TMP);

      assert.equal(rules.length, 1);
      assert.deepEqual(rules[0].tags, ["alpha", "beta", "gamma"]);
    } finally {
      teardown();
    }
  });

  it("handles alwaysApply boolean parsing", () => {
    setup();
    try {
      const yamlTrue = `id: always-on
description: Always apply rule
severity: info
alwaysApply: true
checker:
  type: pattern
  pattern: "x"
  mode: must-not-exist
`;
      const yamlFalse = `id: not-always
description: Conditional rule
severity: info
alwaysApply: false
checker:
  type: pattern
  pattern: "y"
  mode: must-not-exist
`;
      writeFileSync(join(TMP, "always-on.yaml"), yamlTrue);
      writeFileSync(join(TMP, "not-always.yaml"), yamlFalse);
      const rules = loadRulesFromDir(TMP);

      const alwaysOn = rules.find((r) => r.id === "always-on");
      const notAlways = rules.find((r) => r.id === "not-always");

      assert.equal(alwaysOn?.alwaysApply, true);
      assert.equal(notAlways?.alwaysApply, false);
    } finally {
      teardown();
    }
  });

  it("returns empty array for non-existent directory", () => {
    const rules = loadRulesFromDir("/non/existent/path");
    assert.equal(rules.length, 0);
  });
});
