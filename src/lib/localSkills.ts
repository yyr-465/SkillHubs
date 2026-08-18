import type { Skill } from "@/store/skillStore";
import { withSuggestedCategory } from "@/lib/categorize";

export interface LocalLoadResult {
  skills: Skill[];
  contents: Record<string, string>;
  errors: string[];
}

interface PickedSkill {
  id: string;
  content: string;
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

// Mirrors scripts/generate-catalog.mjs: single-line "key: value" front matter.
function parseFrontMatter(content: string): { data: Record<string, string | null>; body: string } | null {
  const lines = splitLines(content);
  if (lines.length === 0 || lines[0].trim() !== "---") return null;
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end === -1) return null;
  const data: Record<string, string | null> = {};
  for (let i = 1; i < end; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value: string | null = line.slice(idx + 1).trim();
    const q0 = value.charAt(0);
    if ((q0 === '"' || q0 === "'") && value.endsWith(q0) && value.length >= 2) {
      value = value.slice(1, -1);
    }
    if (value === "" || value === "null" || value === "~") value = null;
    data[key] = value;
  }
  const body = lines.slice(end + 1).join("\n").trimStart();
  return { data, body };
}

function asStr(value: string | null | undefined): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return null;
}

function buildResult(picked: PickedSkill[], errors: string[]): LocalLoadResult {
  const skills: Skill[] = [];
  const contents: Record<string, string> = {};
  for (const p of picked) {
    const parsed = parseFrontMatter(p.content);
    if (!parsed) {
      errors.push(p.id + ": no valid front matter");
      continue;
    }
    const skill: Skill = {
      id: p.id,
      name: asStr(parsed.data.name) ?? p.id,
      description: asStr(parsed.data.description) ?? "",
      category: asStr(parsed.data.category),
      risk: asStr(parsed.data.risk),
      date_added: asStr(parsed.data.date_added),
      source_path: "",
      source: "local",
      favorite: false,
      icon: asStr(parsed.data.icon),
    };
    skills.push(withSuggestedCategory(skill));
    contents[p.id] = parsed.body;
  }
  return { skills, contents, errors };
}

async function walkDirectory(
  handle: FileSystemDirectoryHandle,
  id: string,
  picked: PickedSkill[],
  errors: string[],
): Promise<void> {
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === "file" && name.toLowerCase() === "skill.md") {
      try {
        const file = await (entry as FileSystemFileHandle).getFile();
        picked.push({ id, content: await file.text() });
      } catch (e) {
        errors.push(String(e));
      }
    } else if (entry.kind === "directory") {
      await walkDirectory(entry as FileSystemDirectoryHandle, name, picked, errors);
    }
  }
}

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
};

async function pickWithDirectoryPicker(pick: () => Promise<FileSystemDirectoryHandle>): Promise<LocalLoadResult> {
  const root = await pick();
  const picked: PickedSkill[] = [];
  const errors: string[] = [];
  await walkDirectory(root, root.name, picked, errors);
  return buildResult(picked, errors);
}

function pickWithWebkitDirectory(): Promise<LocalLoadResult> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) {
        resolve({ skills: [], contents: {}, errors: [] });
        return;
      }
      const picked: PickedSkill[] = [];
      const errors: string[] = [];
      for (const file of files) {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const parts = rel.split("/");
        const base = parts[parts.length - 1] ?? "";
        if (base.toLowerCase() !== "skill.md") continue;
        const id = parts.length >= 2 ? parts[parts.length - 2] : file.name;
        picked.push({ id, content: await file.text() });
      }
      resolve(buildResult(picked, errors));
    };
    input.click();
  });
}

export async function pickSkillDirectory(): Promise<LocalLoadResult> {
  const showPicker = (window as PickerWindow).showDirectoryPicker;
  if (typeof showPicker === "function") {
    return pickWithDirectoryPicker(() => showPicker({ mode: "read" }));
  }
  return pickWithWebkitDirectory();
}
