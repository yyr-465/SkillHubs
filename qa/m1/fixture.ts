import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const scratchPrefix = "skillhub-m1-";
const preload = "data:text/javascript," + encodeURIComponent(
  "import os from 'node:os'; import { syncBuiltinESMExports } from 'node:module';"
  + "os.homedir = () => process.env.SKILLHUB_M1_QA_PROFILE; syncBuiltinESMExports();",
);

const commonDescription = "Generate project release notes from reviewed changes and check required evidence.";
const foldedChinese = "自动化整理归档项目文档并生成可靠的校验报告";
const continuedChinese = "同时保留每项变更的记录以便复核";
const inertDescription = '![preview](https://inventory.example.invalid/pixel) <img src="https://inventory.example.invalid/track">';

function markdown(name: string, description: string, body: string, extra = "") {
  return `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n${body}\n`;
}

function contentFor(ordinal: number, label: string) {
  if ([1, 51, 91].includes(ordinal)) {
    return markdown("Release notes copy", JSON.stringify(commonDescription), "Exact copy.");
  }
  if (ordinal === 126) {
    const data = markdown(
      "Release notes independently authored",
      ">-\n  Ｇｅｎｅｒａｔｅ PROJECT release notes from reviewed changes\n  and check required evidence.",
      "Different body.",
      "compatibility: >-\n  Edge 157\n  and current Node.js\n",
    );
    return "\ufeff" + data.replaceAll("\n", "\r\n");
  }
  if (ordinal === 156 || ordinal === 176) {
    const yaml = `${ordinal === 156 ? ">-" : "|-"}\n  ${foldedChinese}\n  ${continuedChinese}`;
    const title = ordinal === 156 ? "项目文档整理" : "文档整理复核";
    return markdown(title, yaml, `Independent body for ${label}.`);
  }
  const name = ordinal === 11 || ordinal === 177 ? "Same name fixture" : `Fixture ${label}`;
  const description = ordinal === 12 || ordinal === 178 ? "Draft"
    : ordinal === 199 ? inertDescription
    : `Fixture ${label} assembles an independent report with its own required checks.`;
  return markdown(name, JSON.stringify(description), `Synthetic Markdown for ${label}. No external dependencies.`);
}

function put(path: string, data: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data, { flag: "wx" });
}

export function createFixture() {
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(parent, scratchPrefix));
  const sources = join(directory, "sources");
  const profile = join(sources, "profile");
  const project = join(sources, "project");
  const shared = join(profile, ".agents", "skills");
  const claude = join(profile, ".claude", "skills");
  const cursor = join(profile, ".cursor", "skills");
  const extra = join(sources, "extra-skills");
  const scanArgs = [
    "--project", project,
    "--root", extra,
    "--root", shared,
    "--root", join(shared, "overlap"),
  ];

  const files = new Map<number, string>();
  for (const [root, start, end] of [
    [shared, 1, 50],
    [join(profile, ".codex", "skills"), 51, 90],
    [claude, 91, 125],
    [cursor, 126, 155],
    [join(project, ".agents", "skills"), 156, 175],
    [extra, 176, 200],
  ] as const) {
    for (let ordinal: number = start; ordinal <= end; ordinal++) {
      const label = String(ordinal).padStart(3, "0");
      const path = join(root, ...(ordinal <= 10 ? ["overlap"] : []),
        `skill-${label}`, ordinal === 125 ? "skill.MD" : "SKILL.md");
      put(path, contentFor(ordinal, label));
      files.set(ordinal, path);
    }
  }

  put(join(claude, "broken-front-matter", "SKILL.md"), "---\nname: [\n---\n");
  put(join(claude, "oversize-file", "SKILL.md"), Buffer.alloc(1024 * 1024 + 1, 65));
  put(join(cursor, "bad-encoding", "SKILL.md"), Uint8Array.of(0xff, 0xff));
  put(join(project, ".cursor", "skills"), "This path is an ordinary file.\n");
  put(join(shared, "skill-050", "assets", "nested-resource", "SKILL.md"), "Not a standalone package.");
  put(join(claude, ".git", "ignored-package", "SKILL.md"), "Invalid ignored file.");
  put(join(claude, "node_modules", "ignored-package", "SKILL.md"), "Invalid ignored file.");

  return { parent, directory, sources, profile, project, shared, extra, scanArgs, files };
}

export function removeFixture({ directory, parent }: ReturnType<typeof createFixture>) {
  const resolved = realpathSync(directory);
  const child = relative(parent, resolved);
  if (child.startsWith(scratchPrefix) && !child.includes(sep)) {
    rmSync(resolved, { recursive: true, force: true, maxRetries: 3 });
  }
}

export function scanFixture(fixture: ReturnType<typeof createFixture>, output: string) {
  // Use the shipped Node entry and inject only the OS home, which keeps real roots outside this test.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "CODEX_HOME"));
  env.SKILLHUB_M1_QA_PROFILE = fixture.profile;
  const started = performance.now();
  const result = spawnSync(process.execPath, [
    "--import", preload, "local-agent/scan.ts", ...fixture.scanArgs, "--output", output,
  ], { cwd: repo, env, encoding: "utf8", timeout: 20_000, windowsHide: true });
  return { ...result, elapsedMs: performance.now() - started };
}

export function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function snapshotSources(sources: string) {
  return readdirSync(sources, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      const bytes = readFileSync(path);
      return { path: relative(sources, path).split(sep).join("/"), bytes: bytes.length, hash: sha256(bytes) };
    })
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
}

if (import.meta.main) {
  const fixture = createFixture();
  const manifest = join(fixture.directory, "inventory.json");
  const result = scanFixture(fixture, manifest);
  if (result.status !== 0) {
    process.exitCode = 1;
    console.error(result.error ?? result.stderr);
  } else {
    console.log(JSON.stringify({ manifest, cliMs: Math.round(result.elapsedMs) }));
  }
}
