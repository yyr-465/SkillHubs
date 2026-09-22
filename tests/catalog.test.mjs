import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const generator = fileURLToPath(new URL("../scripts/generate-catalog.mjs", import.meta.url));

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillhub-catalog-"));
  fs.mkdirSync(path.join(root, "scripts"));
  fs.mkdirSync(path.join(root, "web-catalog", "skills"), { recursive: true });
  fs.copyFileSync(generator, path.join(root, "scripts", "generate-catalog.mjs"));
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "generate-catalog.mjs")], {
    encoding: "utf8",
  });
}

function addSkill(root, id, content) {
  const dir = path.join(root, "web-catalog", "skills", id);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "SKILL.md"), content);
}

const validSkill = "---\nname: Example\ndescription: Example description\n---\n# Example\n";

test("catalog generation rejects empty and invalid sources", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.match(run(root).stderr, /Catalog source is empty/);
  addSkill(root, "example", "# Missing front matter\n");
  assert.match(run(root).stderr, /Invalid front matter: example/);
  fs.writeFileSync(path.join(root, "web-catalog", "skills", "example", "SKILL.md"), "---\nname: Example\n---\n# Example\n");
  assert.match(run(root).stderr, /Skill requires name, description, and Markdown body/);
});

test("catalog index matches source IDs and removes stale generated Markdown", (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  addSkill(root, "first", validSkill);
  addSkill(root, "second", validSkill.replace("Example", "Second"));

  assert.equal(run(root).status, 0);
  const output = path.join(root, "public", "catalog");
  const index = JSON.parse(fs.readFileSync(path.join(output, "index.json"), "utf8"));
  assert.equal(index.count, 2);
  assert.deepEqual(index.skills.map((skill) => skill.id).sort(), ["first", "second"]);

  fs.rmSync(path.join(root, "web-catalog", "skills", "second"), { recursive: true });
  assert.equal(run(root).status, 0);
  assert.equal(fs.existsSync(path.join(output, "skills", "second.md")), false);
});
