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
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
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
const warnings = [];

if (!fs.existsSync(srcDir)) {
  console.error("Missing source directory: " + srcDir);
  process.exit(1);
}

for (const entry of fs.readdirSync(srcDir)) {
  const dir = path.join(srcDir, entry);
  const mdFile = path.join(dir, "SKILL.md");
  if (!fs.existsSync(mdFile)) continue;
  const parsed = parseFrontMatter(fs.readFileSync(mdFile, "utf8"));
  if (!parsed) {
    warnings.push(entry + ": no front matter, skipped");
    continue;
  }
  const { data, body } = parsed;
  if (data.execution !== undefined && data.execution !== null) {
    warnings.push(entry + ": execution declaration ignored (Web is read-only)");
  }
  skills.push({
    id: entry,
    name: asStr(data.name) ?? entry,
    description: asStr(data.description) ?? "",
    category: asStr(data.category),
    risk: asStr(data.risk),
    date_added: asStr(data.date_added),
    source_path: "",
    source: "catalog",
    favorite: false,
    icon: asStr(data.icon),
  });
  fs.mkdirSync(outSkillsDir, { recursive: true });
  fs.writeFileSync(path.join(outSkillsDir, entry + ".md"), body + NL);
}

skills.sort((a, b) => a.name.localeCompare(b.name));

const index = { generated_at: new Date().toISOString(), count: skills.length, skills };
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2) + NL);

for (const w of warnings) console.error("warning: " + w);
console.log("Generated " + skills.length + " skills -> public/catalog");
