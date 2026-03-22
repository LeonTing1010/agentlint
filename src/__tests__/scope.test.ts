import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveScope } from "../engine/scope.js";

const PROJECT_DIR = "/project";

function abs(rel: string): string {
  return `${PROJECT_DIR}/${rel}`;
}

describe("Glob matching (scope)", () => {
  it('"apps/**" matches "apps/web/src/file.ts"', () => {
    const files = [abs("apps/web/src/file.ts")];
    const result = resolveScope(files, "apps/**", PROJECT_DIR);
    assert.equal(result.length, 1);
    assert.equal(result[0], abs("apps/web/src/file.ts"));
  });

  it('"apps/**" does not match "packages/domain/file.ts"', () => {
    const files = [abs("packages/domain/file.ts")];
    const result = resolveScope(files, "apps/**", PROJECT_DIR);
    assert.equal(result.length, 0);
  });

  it("exclude patterns work", () => {
    const files = [
      abs("apps/web/src/api.ts"),
      abs("apps/web/src/api.test.ts"),
      abs("apps/web/src/service.ts"),
    ];
    const result = resolveScope(
      files,
      {
        include: ["apps/**"],
        exclude: ["**/*.test.ts"],
      },
      PROJECT_DIR
    );
    assert.equal(result.length, 2);
    assert.ok(result.every((f) => !f.includes(".test.ts")));
  });

  it("returns all files when scope is undefined", () => {
    const files = [abs("a.ts"), abs("b.ts")];
    const result = resolveScope(files, undefined, PROJECT_DIR);
    assert.equal(result.length, 2);
  });

  it("scope object with only include works", () => {
    const files = [
      abs("src/index.ts"),
      abs("tests/index.test.ts"),
    ];
    const result = resolveScope(
      files,
      { include: ["src/**"] },
      PROJECT_DIR
    );
    assert.equal(result.length, 1);
    assert.ok(result[0].includes("src/index.ts"));
  });
});
