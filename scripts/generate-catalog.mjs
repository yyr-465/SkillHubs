import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Dependency-free catalogue generator. Reads one SKILL.md per folder under
// web-catalog/skills and emits a static catalogue consumed by the Web build.

const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const srcDir = path.join(root, "web-catalog", "skills");
const outDir = path.join(root, "public", "catalog");
const outSkillsDir = path.join(outDir, "skills");

function splitLines(text) {
  return text
    .split(NL)
    .map((line) => (line.endsWith(CR) ? line.slice(0, -1) : line));
}

// Parses simple single-line `key: value` front matter only. Nested YAML
// (including execution declarations) is intentionally ignored on the Web.
function parseFrontMatter(content) {
  const lines = splitLines(content);
  if (lines.length === 0 || lines[0].trim() !== "---") return null;
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end === -1) return null;
  const data = {};
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(":");
    if (idx === -1 || !line.slice(0, idx).trim()) return null;
    const key = line.slice(0, idx).trim();
    if (Object.hasOwn(data, key)) return null;
    let value = line.slice(idx + 1).trim();
    const q0 = value.charAt(0);
    if ((q0 === '"' || q0 === "'") && value.endsWith(q0) && value.length >= 2) {
      value = value.slice(1, -1);
    }
    if (value === "" || value === "null" || value === "~") value = null;
    data[key] = value;
  }
  const body = lines.slice(end + 1).join(NL).trimStart();
  return { data, body };
}

function asStr(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return null;
}

const skills = [];
const bodies = new Map();
const warnings = [];

if (!fs.existsSync(srcDir)) {
  console.error("Missing source directory: " + srcDir);
  process.exit(1);
}

const entries = fs.readdirSync(srcDir, { withFileTypes: true });
if (entries.length === 0) throw new Error("Catalog source is empty: " + srcDir);

for (const item of entries) {
  const entry = item.name;
  if (!item.isDirectory() || !/^[a-z0-9][a-z0-9-]*$/.test(entry)) {
    throw new Error("Invalid Skill directory: " + entry);
  }
  const dir = path.join(srcDir, entry);
  const mdFile = path.join(dir, "SKILL.md");
  if (!fs.existsSync(mdFile)) throw new Error("Missing SKILL.md: " + entry);
  const parsed = parseFrontMatter(fs.readFileSync(mdFile, "utf8"));
  if (!parsed) throw new Error("Invalid front matter: " + entry);
  const { data, body } = parsed;
  if (!asStr(data.name) || !asStr(data.description) || !body.trim()) {
    throw new Error("Skill requires name, description, and Markdown body: " + entry);
  }
  if (data.execution !== undefined && data.execution !== null) {
    warnings.push(entry + ": execution declaration ignored (Web is read-only)");
  }
  skills.push({
    id: entry,
    name: asStr(data.name),
    description: asStr(data.description),
    category: asStr(data.category),
    risk: asStr(data.risk),
    date_added: asStr(data.date_added),
    source_path: "",
    source: "catalog",
    favorite: false,
    icon: asStr(data.icon),
  });
  bodies.set(entry, body + NL);
}

skills.sort((a, b) => a.name.localeCompare(b.name));

const index = { count: skills.length, skills };
fs.mkdirSync(outSkillsDir, { recursive: true });
for (const file of fs.readdirSync(outSkillsDir)) {
  if (file.endsWith(".md")) fs.rmSync(path.join(outSkillsDir, file));
}
for (const [id, body] of bodies) {
  fs.writeFileSync(path.join(outSkillsDir, id + ".md"), body);
}
const indexFile = path.join(outDir, "index.json");
fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + NL);
const generated = JSON.parse(fs.readFileSync(indexFile, "utf8"));
const sourceIds = [...bodies.keys()].sort();
const generatedIds = generated.skills.map((skill) => skill.id).sort();
if (generated.count !== sourceIds.length || JSON.stringify(generatedIds) !== JSON.stringify(sourceIds)) {
  throw new Error("Generated catalog count or IDs do not match web-catalog/skills");
}

for (const w of warnings) console.error("warning: " + w);
console.log("Generated " + skills.length + " skills -> public/catalog");
