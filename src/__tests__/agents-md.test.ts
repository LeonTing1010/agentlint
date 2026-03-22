import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseAgentsMd } from "../parsers/agents-md.js";

const TMP = join(import.meta.dirname, "../../.test-tmp-agents-md");

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
}

function teardown() {
  rmSync(TMP, { recursive: true, force: true });
}

function writeMd(content: string): string {
  const path = join(TMP, "AGENTS.md");
  writeFileSync(path, content);
  return path;
}

describe("AGENTS.md parser", () => {
  it('extracts "NEVER `import X` in `apps/`" correctly', () => {
    setup();
    try {
      const path = writeMd(
        `# Rules\n- NEVER \`import { prisma } from '@org/database'\` in \`apps/\`\n`
      );
      const rules = parseAgentsMd(path);

      assert.ok(rules.length > 0, "should extract at least one rule");
      const rule = rules[0];
      assert.equal(rule.checker.type, "pattern");
      if (rule.checker.type === "pattern") {
        assert.equal(rule.checker.mode, "must-not-exist");
        // Pattern should match the import
        assert.ok(
          new RegExp(rule.checker.pattern).test(
            "import { prisma } from '@org/database'"
          ),
          `pattern "${rule.checker.pattern}" should match the import`
        );
      }
      // Scope should target apps/
      assert.ok(
        typeof rule.scope === "string" && rule.scope.includes("apps"),
        `scope should include apps/, got: ${JSON.stringify(rule.scope)}`
      );
    } finally {
      teardown();
    }
  });

  it("skips lines without NEVER keyword", () => {
    setup();
    try {
      const path = writeMd(
        `# Rules\n- Use \`apiSuccess()\` for responses\n- Prefer \`DomainError\` over Error\n`
      );
      const rules = parseAgentsMd(path);

      assert.equal(rules.length, 0, "should not extract rules without NEVER/ALWAYS");
    } finally {
      teardown();
    }
  });

  it("skips table rows and code blocks", () => {
    setup();
    try {
      const path = writeMd(
        [
          "# Architecture",
          "",
          "| Layer | Rule |",
          "| ----- | ---- |",
          "| Apps | NEVER `import prisma` in `apps/` |",
          "",
          "```typescript",
          '// NEVER use `eval()` directly',
          "```",
          "",
        ].join("\n")
      );
      const rules = parseAgentsMd(path);

      // Table rows start with | and code block contents should be skipped
      assert.equal(rules.length, 0, "should skip table rows and code block contents");
    } finally {
      teardown();
    }
  });

  it("handles Chinese keyword", () => {
    setup();
    try {
      const path = writeMd(`# Rules\n- 禁止 \`prisma.db.push()\` in production code\n`);
      const rules = parseAgentsMd(path);

      assert.ok(rules.length > 0, "should extract rules with Chinese keyword");
      const rule = rules[0];
      assert.equal(rule.checker.type, "pattern");
      if (rule.checker.type === "pattern") {
        assert.equal(rule.checker.mode, "must-not-exist");
      }
    } finally {
      teardown();
    }
  });

  it("skips generic patterns (too short, Chinese-only text)", () => {
    setup();
    try {
      const path = writeMd(
        [
          "# Rules",
          "- NEVER `ab` in code",         // too short (< 4 chars)
          "- NEVER `.*` in code",          // too generic
          "",
        ].join("\n")
      );
      const rules = parseAgentsMd(path);

      assert.equal(rules.length, 0, "should skip patterns that are too short or generic");
    } finally {
      teardown();
    }
  });
});
