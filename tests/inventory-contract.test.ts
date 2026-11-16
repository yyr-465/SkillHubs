import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  inventoryManifestSchema,
  isInventoryRelativePath,
  MAX_INVENTORY_DIAGNOSTICS,
  MAX_INVENTORY_INSTALLATIONS,
  MAX_INVENTORY_ROOTS,
  validateInventoryManifest,
  type InventoryManifest,
} from "../shared/inventory/manifest.ts";

const rootId = "a".repeat(64);
const installationId = "b".repeat(64);
const otherId = "c".repeat(64);

function valid(): InventoryManifest {
  return {
    schemaVersion: 1,
    generatedAt: "2026-11-16T12:00:00.000Z",
    roots: [{ id: rootId, kind: "shared", scope: "user", status: "partial" }],
    installations: [{
      id: installationId,
      skillMdSha256: otherId,
      name: "示例技能",
      description: "First line.\nSecond line.",
      locations: [{ rootId, relativePath: "示例/sKiLl.Md" }],
    }],
    diagnostics: [{ rootId, code: "invalid_front_matter", relativePath: "invalid" }],
    omittedDiagnostics: 0,
  };
}

const invalid = { ok: false, error: "invalid_manifest" };

test("V1 accepts a partial inventory, multiple locators, and a valid empty report", () => {
  const manifest = valid();
  manifest.roots.push({ id: otherId, kind: "custom", scope: "custom", status: "scanned" });
  manifest.installations[0].locations.push({ rootId: otherId, relativePath: "SKILL.md" });
  manifest.installations[0].name = "𠮷".repeat(128);
  assert.deepEqual(validateInventoryManifest(manifest), { ok: true, manifest });
  const empty = { ...valid(), installations: [], roots: [{ ...valid().roots[0], status: "missing" }] };
  assert.deepEqual(validateInventoryManifest(empty), { ok: true, manifest: empty });
});

test("V1 is closed and strict with a distinct error for an unknown version", () => {
  assert.deepEqual(validateInventoryManifest({ schemaVersion: 2 }), { ok: false, error: "unsupported_version" });
  for (const input of [
    null,
    Object.create(valid()),
    { ...valid(), schemaVersion: "1" },
    { ...valid(), count: 3 },
    { ...valid(), generatedAt: "2026-02-30T00:00:00.000Z" },
    { ...valid(), generatedAt: "2026-11-16T00:00:00.000+00:00" },
    { ...valid(), omittedDiagnostics: 1.5 },
    { ...valid(), roots: [] },
    { ...valid(), roots: Array(MAX_INVENTORY_ROOTS + 1).fill(valid().roots[0]) },
    { ...valid(), installations: Array(MAX_INVENTORY_INSTALLATIONS + 1).fill(valid().installations[0]) },
    { ...valid(), diagnostics: Array(MAX_INVENTORY_DIAGNOSTICS + 1).fill(valid().diagnostics[0]) },
    { ...valid(), roots: [{ ...valid().roots[0], path: "extra" }] },
    { ...valid(), installations: [{ ...valid().installations[0], name: " padded" }] },
    { ...valid(), installations: [{ ...valid().installations[0], name: "𠮷".repeat(129) }] },
    { ...valid(), installations: [{ ...valid().installations[0], description: "line\n" }] },
    { ...valid(), diagnostics: [{ ...valid().diagnostics[0], code: "unknown" }] },
    JSON.parse(JSON.stringify(valid()).replace('"schemaVersion"', '"__proto__":{},"schemaVersion"')),
  ]) assert.deepEqual(validateInventoryManifest(input), invalid);
});

test("local paths are exact relative display strings, with a Skill filename for locators", () => {
  for (const path of [
    "/SKILL.md", "//host/SKILL.md", "C:/SKILL.md", "C:SKILL.md", "a\\SKILL.md",
    "a//SKILL.md", "./SKILL.md", "a/../SKILL.md", "a/\u0085/SKILL.md", "a/SKILL.md\n",
    "a/SKILL.md/", "a/NotSkill.md", "x".repeat(1_024) + "/SKILL.md",
  ]) {
    assert.equal(isInventoryRelativePath(path, true), false, JSON.stringify(path));
    const manifest = valid();
    manifest.installations[0].locations[0].relativePath = path;
    assert.deepEqual(validateInventoryManifest(manifest), invalid, JSON.stringify(path));
  }
  assert.equal(isInventoryRelativePath("package/SKILL.MD", true), true);
  assert.equal(isInventoryRelativePath("package/other.md"), true);
  assert.equal(isInventoryRelativePath("..hidden/file"), true);
  assert.equal(isInventoryRelativePath("package/.."), false);
});

test("source and locator relations cannot contradict the coverage or duplicate an identity", () => {
  const inputs: InventoryManifest[] = [];
  function add(mutate: (manifest: InventoryManifest) => void) {
    const manifest = valid();
    mutate(manifest);
    inputs.push(manifest);
  }
  add((manifest) => manifest.roots.push({ ...manifest.roots[0] }));
  add((manifest) => { manifest.roots[0].scope = "custom"; });
  add((manifest) => { manifest.roots[0] = { ...manifest.roots[0], kind: "codex", scope: "project" }; });
  add((manifest) => { manifest.roots[0].status = "missing"; });
  add((manifest) => { manifest.installations[0].locations[0].rootId = otherId; });
  add((manifest) => manifest.installations.push(structuredClone(manifest.installations[0])));
  add((manifest) => manifest.installations.push({ ...structuredClone(manifest.installations[0]), id: otherId }));
  add((manifest) => manifest.installations[0].locations.push({ ...manifest.installations[0].locations[0] }));
  add((manifest) => { manifest.diagnostics[0].rootId = otherId; });
  for (const manifest of inputs) assert.deepEqual(validateInventoryManifest(manifest), invalid);
});

test("checked-in portable JSON Schema matches the single V1 source", () => {
  const stored = readFileSync(new URL("../docs/inventory-manifest-v1.schema.json", import.meta.url), "utf8");
  assert.deepEqual(JSON.parse(stored), JSON.parse(JSON.stringify(inventoryManifestSchema)));
});
