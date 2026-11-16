import assert from "node:assert/strict";
import test from "node:test";
import { MAX_INVENTORY_BYTES, type InventoryInstallation, type InventoryManifest } from "../shared/inventory/manifest.ts";
import { analyzeInventory, filterInstallations, readInventory } from "../src/lib/inventory.ts";
import en from "../src/i18n/en.json" with { type: "json" };
import zh from "../src/i18n/zh.json" with { type: "json" };

const digest = (number: number) => number.toString(16).padStart(64, "0");
const shared = digest(91);
const custom = digest(92);
const missing = digest(93);
const unreadable = digest(94);
const linked = digest(95);

function installation(number: number, description: string, hash = number): InventoryInstallation {
  return {
    id: digest(number),
    skillMdSha256: digest(hash),
    name: "Synthetic Skill",
    description,
    locations: [{ rootId: shared, relativePath: "row-" + number + "/SKILL.md" }],
  };
}

const foldedMatch = "Prepare multilingual reports with repeatable folder checks";
const unicodeFloor = "字".repeat(31) + "𝟙" + " … !";
const short = "字".repeat(31) + " … !";
const rows = [
  installation(1, foldedMatch),
  installation(2, foldedMatch, 1),
  installation(3, "PREPARE MULTILINGUAL\n\tREPORTS WITH REPEATABLE\u0085ＦＯＬＤＥＲ CHECKS"),
  installation(4, unicodeFloor),
  installation(5, unicodeFloor),
  installation(6, short),
  installation(7, short),
  installation(8, "The setup reads a local project outline for its example actions only."),
  installation(9, "This separate example demonstrates sorting regional test datasets."),
];
rows[0].locations.push(
  { rootId: custom, relativePath: "次级目录/SKILL.md" },
  { rootId: custom, relativePath: "synonym/SKILL.md" },
);
rows[0].name = "中文报告";
rows[1].name = "中文报告";

const manifest: InventoryManifest = {
  schemaVersion: 1,
  generatedAt: "2026-11-16T00:00:00.000Z",
  roots: [
    { id: shared, kind: "shared", scope: "user", status: "scanned" },
    { id: custom, kind: "custom", scope: "custom", status: "partial" },
    { id: missing, kind: "cursor", scope: "project", status: "missing" },
    { id: unreadable, kind: "claude-code", scope: "user", status: "unreadable" },
    { id: linked, kind: "codex", scope: "user", status: "skipped_link" },
  ],
  installations: rows,
  diagnostics: [{ rootId: custom, code: "invalid_front_matter", relativePath: "bad/SKILL.md" }],
  omittedDiagnostics: 0,
};

test("Web file boundary applies the byte cap before reading and accepts the exact limit", async () => {
  let reads = 0;
  assert.deepEqual(await readInventory({
    size: MAX_INVENTORY_BYTES + 1,
    arrayBuffer: async () => { reads++; return new ArrayBuffer(0); },
  }), { ok: false, error: "too_large" });
  assert.equal(reads, 0);

  const json = JSON.stringify(manifest);
  const file = new Blob([json, " ".repeat(MAX_INVENTORY_BYTES - Buffer.byteLength(json))]);
  assert.equal(file.size, MAX_INVENTORY_BYTES);
  assert.deepEqual(await readInventory(file), { ok: true, manifest });
});

test("Web imports valid Unicode JSON and rejects unreadable, malformed or incompatible selections", async () => {
  assert.deepEqual(await readInventory(new Blob(["\ufeff", JSON.stringify(manifest)])), { ok: true, manifest });
  assert.deepEqual(await readInventory({ size: 1, arrayBuffer: async () => { throw Error("Unreadable"); } }),
    { ok: false, error: "read_failed" });
  assert.deepEqual(await readInventory(new Blob(["{"])), { ok: false, error: "invalid_json" });
  assert.deepEqual(await readInventory(new Blob([new Uint8Array([0xc3, 0x28])])),
    { ok: false, error: "invalid_json" });
  assert.deepEqual(await readInventory(new Blob([JSON.stringify({ ...manifest, schemaVersion: 2 })])),
    { ok: false, error: "unsupported_version" });
  assert.deepEqual(await readInventory(new Blob([JSON.stringify({ ...manifest, totalCount: 999 })])),
    { ok: false, error: "invalid_manifest" });
});

test("Web overview distinguishes installation, content and scanned source counts", () => {
  const result = analyzeInventory(manifest);
  assert.equal(result.installationCount, 9);
  assert.equal(result.contentCount, 8);
  assert.equal(result.sourceCount, 2);
  assert.deepEqual([...result.countsByRoot], [[shared, 9], [custom, 1]]);
});

test("Web evidence groups follow raw file hashes, Unicode normalized descriptions and no name fallback", () => {
  const result = analyzeInventory(manifest);
  assert.deepEqual(result.identicalFiles.map(([hash, members]) => [hash, members.map(({ id }) => id)]),
    [[digest(1), [digest(1), digest(2)]]]);
  assert.deepEqual(result.matchingDescriptions.map(([description, members]) => [description, members.map(({ id }) => id)]), [
    [foldedMatch.toLowerCase(), [digest(1), digest(2), digest(3)]],
    ["字".repeat(31) + "1 ... !", [digest(4), digest(5)]],
  ]);
});

test("Web search matches names, descriptions and every relative location while intersecting the source filter", () => {
  const search = (query: string, rootId = "") =>
    filterInstallations(manifest.installations, query, rootId).map(({ id }) => id);
  assert.deepEqual(search("中文报告"), [digest(1), digest(2)]);
  assert.deepEqual(search("multilingual reports"), [digest(1), digest(2), digest(3)]);
  assert.deepEqual(search("次级目录/SKILL.MD"), [digest(1)]);
  assert.deepEqual(search("reports", custom), [digest(1)]);
  assert.deepEqual(search("", missing), []);
});

test("Web inventory strings have complete Chinese and English coverage", () => {
  const inventoryKeys = (dict: Record<string, string>) => Object.keys(dict).filter((key) => key.startsWith("inventory.")).sort();
  assert.deepEqual(inventoryKeys(en), inventoryKeys(zh));
});
