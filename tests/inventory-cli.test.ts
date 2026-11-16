import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { prepareInventoryRoots, scanInventory } from "../local-agent/inventory.ts";
import { validateInventoryManifest } from "../shared/inventory/manifest.ts";

const windows = process.platform === "win32";
const scratch = resolve(".runtime-qa");
const good = "---\nname: Shared name\ndescription: A test description with enough letters\n---\n";

function workspace(t: TestContext) {
  mkdirSync(scratch, { recursive: true });
  const prefix = join(realpathSync.native(scratch), "m1-cli-");
  const path = mkdtempSync(prefix);
  t.after(() => {
    const resolved = realpathSync.native(path);
    assert.ok(resolved.startsWith(prefix));
    rmSync(resolved, { recursive: true, force: true });
  });
  return path;
}

function write(path: string, content: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function cli(args: string[], nodeArgs: string[] = []) {
  const result = spawnSync(process.execPath, [...nodeArgs, "local-agent/scan.ts", ...args], { encoding: "utf8" });
  assert.ifError(result.error);
  return result;
}

function linkDirectory(from: string, to: string, t: TestContext) {
  try {
    symlinkSync(to, from, windows ? "junction" : "dir");
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "EPERM" || error.code === "EACCES")) {
      t.skip("This process cannot create the synthetic directory link.");
      return false;
    }
    throw error;
  }
}

test("discovers only selected locations, coalesces canonical overlaps, and keeps actual file spelling", (t) => {
  const base = workspace(t);
  const home = join(base, "profile");
  const project = join(base, "project");
  const codexHome = join(base, "codex-config");
  const shared = join(home, ".agents", "skills");
  const grouping = join(shared, "group");
  const foldedBytes = Buffer.from(
    "\uFEFF---\r\nname: 中文 Skill\r\ndescription: >-\r\n  第一行包含中文\r\n  第二行可供检索\r\n"
    + "compatibility: |- \r\n  Node 22\r\n  Windows\r\nicon: https://asset.invalid/icon.png\r\n"
    + "execution: { command: ignored }\r\n---\r\n# Original bytes\r\n",
  );
  const folded = write(join(grouping, "alpha", "sKiLl.Md"), foldedBytes);
  write(join(grouping, "alpha", "resources", "ignored", "SKILL.md"), good);
  write(join(shared, ".git", "ignored", "SKILL.md"), good);
  write(join(shared, "node_modules", "ignored", "SKILL.md"), good);
  write(join(shared, "other", "first", "SKILL.md"), good);
  write(join(shared, "other", "second", "SKILL.md"), good + "A different body");
  write(join(home, ".codex", "skills", "ignored", "SKILL.md"), good);
  write(join(codexHome, "skills", "selected", "SKILL.md"), good);
  write(join(project, ".claude", "skills", "SKILL.md"), good);
  write(join(project, ".cursor", "skills"), "This root is not a directory.");
  const alias = windows ? shared.toUpperCase() : shared;
  const selection = { defaults: true, project, custom: [shared, grouping, alias] };
  const roots = prepareInventoryRoots(selection, { home, codexHome });
  assert.equal(roots.length, 9);
  const manifest = scanInventory(roots);
  assert.ok(validateInventoryManifest(manifest).ok);
  assert.equal(manifest.installations.length, 5);
  assert.equal(manifest.roots.filter((root) => root.status === "missing").length, 3);
  assert.equal(manifest.roots.find((root) => root.kind === "cursor" && root.scope === "project")?.status, "unreadable");

  const main = manifest.installations.find((row) => row.name === "中文 Skill");
  assert.ok(main);
  assert.equal(main.description, "第一行包含中文 第二行可供检索");
  assert.equal(main.compatibility, "Node 22\nWindows");
  assert.equal(main.skillMdSha256, createHash("sha256").update(foldedBytes).digest("hex"));
  assert.deepEqual(main.locations.map((loc) => loc.relativePath).sort(), [
    "alpha/sKiLl.Md", "group/alpha/sKiLl.Md", "group/alpha/sKiLl.Md",
  ]);
  assert.equal(new Set(main.locations.map((loc) => loc.rootId)).size, 3);
  assert.equal(Object.hasOwn(main, "icon"), false);
  assert.equal(Object.hasOwn(main, "execution"), false);

  const sameName = manifest.installations.filter((row) => row.locations.some((loc) => loc.relativePath.startsWith("other/")));
  assert.equal(sameName.length, 2);
  assert.equal(sameName[0].name, sameName[1].name);
  assert.notEqual(sameName[0].id, sameName[1].id);
  assert.notEqual(sameName[0].skillMdSha256, sameName[1].skillMdSha256);
  assert.deepEqual({ ...scanInventory(roots), generatedAt: manifest.generatedAt }, manifest);

  writeFileSync(folded, Buffer.concat([foldedBytes, Buffer.from("Edited body only")]));
  const edited = scanInventory(roots).installations.find((row) => row.name === "中文 Skill");
  assert.equal(edited?.id, main.id);
  assert.notEqual(edited?.skillMdSha256, main.skillMdSha256);
});

test("isolates invalid UTF-8 and malformed, oversized, and too deeply nested inputs", (t) => {
  const base = workspace(t);
  const file = (name: string, content: string | Buffer) => write(join(base, name, "SKILL.md"), content);
  file("valid", good.replace("\n---\n", "\ncompatibility: [invalid]\n---\n"));
  file("utf8", Buffer.concat([Buffer.from(good), Buffer.from([0xc3, 0x28])]));
  file("oversize", Buffer.alloc(1024 * 1024 + 1, 65));
  file("oversize-yaml", good.replace("\n---\n", "\n#" + "a".repeat(32 * 1024) + "\n---\n"));
  file("duplicate", "---\nname: first\nname: second\ndescription: words\n---\n");
  file("alias", "---\nname: &base first\ndescription: *base\n---\n");
  file("tag", "---\nname: !unknown first\ndescription: words\n---\n");
  file("shape", "---\nname: [first]\ndescription: words\n---\n");
  file("nesting", "---\nname: first\ndescription: words\nignored: " + "[".repeat(17) + "x" + "]".repeat(17) + "\n---\n");
  mkdirSync(join(base, "not-a-file", "SKILL.md"), { recursive: true });
  const near = Array.from({ length: 32 }, () => "a");
  write(join(base, ...near, "too-deep", "SKILL.md"), good);
  const manifest = scanInventory(prepareInventoryRoots({ defaults: false, custom: [base] }));

  assert.ok(validateInventoryManifest(manifest).ok);
  assert.equal(manifest.roots[0].status, "partial");
  assert.equal(manifest.installations.length, 1);
  assert.equal(manifest.installations[0].compatibility, undefined);
  const issues = Object.fromEntries(manifest.diagnostics.map(({ relativePath, code }) => [relativePath, code]));
  assert.deepEqual(issues, {
    "alias/SKILL.md": "invalid_front_matter",
    "duplicate/SKILL.md": "invalid_front_matter",
    "nesting/SKILL.md": "invalid_front_matter",
    "not-a-file/SKILL.md": "invalid_file",
    "oversize-yaml/SKILL.md": "limit_reached",
    "oversize/SKILL.md": "limit_reached",
    "shape/SKILL.md": "invalid_front_matter",
    "tag/SKILL.md": "invalid_front_matter",
    "utf8/SKILL.md": "invalid_file",
    [near.join("/") + "/too-deep"]: "limit_reached",
  });
});

test("caps directory enumeration and discards a listing whose end it cannot confirm", (t) => {
  const source = workspace(t);
  let reads = 0;
  let closed = false;
  t.mock.method(fs, "opendirSync", () => ({
    readSync() {
      reads++;
      return { name: "entry-" + reads };
    },
    closeSync() {
      closed = true;
    },
  }));
  syncBuiltinESMExports();
  try {
    const manifest = scanInventory(prepareInventoryRoots({ defaults: false, custom: [source] }));
    assert.equal(reads, 25_000);
    assert.equal(closed, true);
    assert.equal(manifest.roots[0].status, "partial");
    assert.equal(manifest.diagnostics[0].code, "limit_reached");
    assert.equal(manifest.installations.length, 0);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test("does not traverse links or junctions and checks where an aliased output would land", (t) => {
  const base = workspace(t);
  const allowed = join(base, "selected");
  const outside = join(base, "outside");
  write(join(outside, "skill", "SKILL.md"), good);
  write(join(allowed, "kept", "SKILL.md"), good);
  if (!linkDirectory(join(allowed, "escape"), outside, t)) return;
  if (!linkDirectory(join(allowed, "SKILL.md"), outside, t)) return;
  const rootAlias = join(base, "alias");
  if (!linkDirectory(rootAlias, allowed, t)) return;
  const options = { defaults: false, custom: [allowed, rootAlias, join(rootAlias, "kept")] };
  const manifest = scanInventory(prepareInventoryRoots(options));
  assert.ok(validateInventoryManifest(manifest).ok);
  assert.deepEqual(manifest.roots.map((root) => root.status).sort(), ["partial", "skipped_link", "skipped_link"]);
  assert.deepEqual(manifest.installations[0]?.locations.map((loc) => loc.relativePath), ["kept/SKILL.md"]);
  assert.equal(manifest.installations.length, 1);
  assert.equal(manifest.diagnostics.find((item) => item.relativePath === "escape")?.code, "link_skipped");
  assert.equal(manifest.diagnostics.find((item) => item.relativePath === "SKILL.md")?.code, "link_skipped");

  const output = join(rootAlias, "rejected.json");
  const rejected = cli(["--no-defaults", "--root", allowed, "--output", output]);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /outside every scan root/);
  assert.equal(existsSync(join(allowed, "rejected.json")), false);
});

test("continues scanning siblings when a directory is named SKILL.md", (t) => {
  const base = workspace(t);
  const source = join(base, "source");
  mkdirSync(join(source, "SKILL.md"), { recursive: true });
  write(join(source, "kept", "SKILL.md"), good);
  const output = join(base, "inventory.json");

  const response = cli(["--no-defaults", "--root", source, "--output", output]);
  assert.equal(response.status, 0, response.stderr);
  const result = validateInventoryManifest(JSON.parse(readFileSync(output, "utf8")));
  assert.ok(result.ok);
  const { roots, installations } = result.manifest;
  assert.equal(installations.length, 1);
  assert.deepEqual(installations[0].locations, [{ rootId: roots[0].id, relativePath: "kept/SKILL.md" }]);
});

test("normal CLI creates one valid export and refuses unsafe paths or existing files", (t) => {
  const base = workspace(t);
  const source = join(base, "source");
  const skill = write(join(source, "demo", "SKILL.md"), good);
  const args = ["--no-defaults", "--root", source, "--output"];
  const output = join(base, "inventory.json");
  const first = cli([...args, output]);
  assert.equal(first.status, 0, first.stderr);
  const payload = readFileSync(output, "utf8");
  const result = validateInventoryManifest(JSON.parse(payload));
  assert.ok(result.ok);
  assert.match(first.stdout, new RegExp(result.manifest.roots[0].id));
  assert.equal(result.manifest.installations[0].locations[0].relativePath, "demo/SKILL.md");
  assert.equal(payload.includes(base), false);
  assert.equal(cli([...args, output]).status, 1);
  assert.equal(readFileSync(output, "utf8"), payload);
  assert.equal(cli([...args, skill]).status, 1);
  assert.equal(readFileSync(skill, "utf8"), good);

  const inside = join(windows ? source.toUpperCase() : source, "inside.json");
  assert.equal(cli([...args, inside]).status, 1);
  assert.equal(existsSync(inside), false);
  const missing = join(base, "missing-root");
  const rejected = cli(["--no-defaults", "--root", missing, "--output", missing]);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /outside every scan root/);
  assert.equal(existsSync(missing), false);
  assert.equal(cli(["--no-defaults", "--output", join(base, "no-roots.json")]).status, 1);
  assert.equal(cli([...args, join(base, "bad-flag.json"), "--unsupported"]).status, 1);
  if (windows) {
    for (const invalid of ["inventory.json:alternate", "CON.json", "CONOUT$", "trailing.json.", "trailing.json "]) {
      const response = cli([...args, join(base, invalid)]);
      assert.equal(response.status, 1);
      assert.match(response.stderr, /Choose a new output file/);
    }
    assert.equal(existsSync(join(base, "inventory.json:alternate")), false);
    assert.equal(existsSync(join(base, "trailing.json")), false);
  }
});

test("rejects a valid inventory whose encoded JSON exceeds 8 MiB before creating output", (t) => {
  const base = workspace(t);
  const source = join(base, "source");
  const wide = "---\nname: Wide description\ndescription: " + "界".repeat(2_048) + "\n---\n";
  // Descriptions alone contribute 8,601,600 bytes. A JavaScript character count
  // would miss the limit since each of these characters occupies 3 UTF-8 bytes.
  for (let i = 0; i < 1_400; i++) write(join(source, String(i), "SKILL.md"), wide);
  const output = join(base, "over-limit.json");
  const response = cli(["--no-defaults", "--root", source, "--output", output]);
  assert.equal(response.status, 1);
  assert.match(response.stderr, /exceeds 8 MiB/);
  assert.equal(existsSync(output), false);
});

test("removes its incomplete new output on a write failure", (t) => {
  const base = workspace(t);
  const source = join(base, "source");
  write(join(source, "demo", "SKILL.md"), good);
  const output = join(base, "incomplete.json");
  const preload = `import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    const write = fs.writeFileSync;
    fs.writeFileSync = (file, content, encoding) => {
      if (typeof file !== "number") return write(file, content, encoding);
      write(file, "{");
      throw new Error("Synthetic write failure must not leak");
    };
    syncBuiltinESMExports();`;
  const response = cli(["--no-defaults", "--root", source, "--output", output], [
    "--import", "data:text/javascript," + encodeURIComponent(preload),
  ]);
  assert.equal(response.status, 1);
  assert.match(response.stderr, /Could not finish writing/);
  assert.doesNotMatch(response.stderr, /Synthetic write failure/);
  assert.equal(existsSync(output), false);
});
