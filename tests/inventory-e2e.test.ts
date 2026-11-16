import assert from "node:assert/strict";
import { existsSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createFixture, removeFixture, scanFixture, sha256, snapshotSources } from "../qa/m1/fixture.ts";
import { validateInventoryManifest, type InventoryInstallation } from "../shared/inventory/manifest.ts";

test("independent synthetic manifest satisfies V1", () => {
  const sharedExample = new URL("../qa/m1/example-manifest.json", import.meta.url);
  const manifest: unknown = JSON.parse(readFileSync(sharedExample, "utf8"));
  assert.equal(validateInventoryManifest(manifest).ok, true);
});

test("the CLI exports the frozen 200-installation fixture and preserves its sources", (t) => {
  const fixture = createFixture();
  t.after(() => removeFixture(fixture));
  const before = snapshotSources(fixture.sources);
  const sourceByteCount = before
    .filter(({ path }) => /(?:^|\/)skill\.md$/iu.test(path))
    .reduce((sum, file) => sum + file.bytes, 0);
  assert.ok(sourceByteCount <= 2 * 1024 * 1024);
  const manifestPath = join(fixture.directory, "inventory.json");
  const cli = scanFixture(fixture, manifestPath);
  assert.ifError(cli.error);
  assert.equal(cli.status, 0, cli.stderr);
  const manifestBytes = readFileSync(manifestPath);
  const manifestText = manifestBytes.toString("utf8");
  const manifestResult = validateInventoryManifest(JSON.parse(manifestText));
  assert.ok(manifestResult.ok);
  const { manifest } = manifestResult;
  t.diagnostic(`SKILL.md fixture bytes: ${sourceByteCount}; V1 JSON bytes: ${manifestBytes.length}; CLI process: ${cli.elapsedMs.toFixed(1)} ms`);
  assert.equal(manifest.installations.length, 200);
  assert.equal(new Set(manifest.installations.map((row) => row.skillMdSha256)).size, 198);
  assert.equal(manifest.roots.filter(({ status }) => status === "scanned" || status === "partial").length, 8);
  assert.equal(manifest.installations.reduce((sum, row) => sum + row.locations.length, 0), 260);
  assert.equal(manifest.omittedDiagnostics, 0);

  const actualRoots = manifest.roots.map((root) => {
    const count = manifest.installations.filter((row) => row.locations.some(({ rootId }) => rootId === root.id)).length;
    return `${root.kind}/${root.scope}/${root.status}/${count}`;
  }).sort();
  assert.deepEqual(actualRoots, [
    "shared/user/scanned/50", "codex/user/scanned/40", "claude-code/user/partial/35",
    "cursor/user/partial/30", "shared/project/scanned/20", "claude-code/project/missing/0",
    "cursor/project/unreadable/0", "custom/custom/scanned/25", "custom/custom/scanned/50", "custom/custom/scanned/10",
  ].sort());
  assert.deepEqual(manifest.diagnostics.map(({ code, relativePath }) => `${code}:${relativePath ?? ""}`).sort(), [
    "invalid_front_matter:broken-front-matter/SKILL.md", "limit_reached:oversize-file/SKILL.md",
    "invalid_file:bad-encoding/SKILL.md", "root_unavailable:", "root_unavailable:",
  ].sort());

  const byOrdinal = new Map<number, InventoryInstallation>();
  for (const row of manifest.installations) {
    const ordinals = [...new Set(row.locations.map(({ relativePath }) =>
      Number(/(?:^|\/)skill-([0-9]{3})\/skill\.md$/iu.exec(relativePath)?.[1]),
    ))];
    assert.equal(ordinals.length, 1, "locators for one installation must refer to one fixture file");
    const [ordinal] = ordinals;
    assert.ok(!byOrdinal.has(ordinal), "overlap must not duplicate an installation");
    const path = fixture.files.get(ordinal);
    assert.ok(path, "the installation must identify a fixture file");
    assert.equal(row.skillMdSha256, sha256(readFileSync(path)));
    byOrdinal.set(ordinal, row);
  }
  const first = byOrdinal.get(1);
  assert.ok(first);
  assert.deepEqual(first.locations.map(({ relativePath }) => relativePath).sort(), [
    "overlap/skill-001/SKILL.md", "overlap/skill-001/SKILL.md", "skill-001/SKILL.md",
  ]);
  assert.equal(new Set(first.locations.map(({ rootId }) => rootId)).size, 3);
  assert.deepEqual([...byOrdinal].filter(([, row]) => row.skillMdSha256 === first.skillMdSha256)
    .map(([ordinal]) => ordinal).sort((a, b) => a - b), [1, 51, 91]);
  assert.equal(byOrdinal.get(11)?.name, byOrdinal.get(177)?.name);
  assert.notEqual(byOrdinal.get(11)?.description, byOrdinal.get(177)?.description);
  assert.equal(byOrdinal.get(125)?.locations[0].relativePath, "skill-125/skill.MD");
  assert.equal(byOrdinal.get(126)?.compatibility, "Edge 157 and current Node.js");
  assert.equal(byOrdinal.get(156)?.name, "项目文档整理");
  assert.equal(byOrdinal.get(156)?.description, "自动化整理归档项目文档并生成可靠的校验报告 同时保留每项变更的记录以便复核");
  assert.equal(byOrdinal.get(176)?.description, "自动化整理归档项目文档并生成可靠的校验报告\n同时保留每项变更的记录以便复核");
  assert.ok(!manifestText.includes("Different body."));
  assert.ok(!manifestText.includes(JSON.stringify(fixture.sources).slice(1, -1)));

  const repeatPath = join(fixture.directory, "inventory-2.json");
  const repeat = scanFixture(fixture, repeatPath);
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.deepEqual(JSON.parse(readFileSync(repeatPath, "utf8")), {
    ...manifest, generatedAt: JSON.parse(readFileSync(repeatPath, "utf8")).generatedAt,
  });

  assert.notEqual(scanFixture(fixture, manifestPath).status, 0, "existing export must not be overwritten");
  assert.deepEqual(readFileSync(manifestPath), manifestBytes);
  const inside = join(fixture.shared, "must-not-write.json");
  assert.notEqual(scanFixture(fixture, inside).status, 0, "export inside a source must fail");
  assert.equal(existsSync(inside), false);

  const alias = join(fixture.directory, "linked-output-parent");
  try {
    symlinkSync(fixture.shared, alias, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "EPERM" || error.code === "EACCES")) {
      t.diagnostic("Output-parent link check unavailable: this environment cannot create directory links.");
    } else {
      throw error;
    }
  }
  if (existsSync(alias)) {
    const redirected = join(alias, "must-not-write.json");
    assert.notEqual(scanFixture(fixture, redirected).status, 0, "resolved output parent inside a source must fail");
    assert.equal(existsSync(redirected), false);
  }
  assert.deepEqual(snapshotSources(fixture.sources), before);
});
