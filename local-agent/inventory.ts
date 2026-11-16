import { createHash } from "node:crypto";
import { lstatSync, opendirSync, realpathSync } from "node:fs";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { join, parse, resolve, sep } from "node:path";
import {
  isInventoryRelativePath, MAX_INVENTORY_DIAGNOSTICS, MAX_INVENTORY_INSTALLATIONS, MAX_INVENTORY_ROOTS,
} from "../shared/inventory/manifest.ts";
import type { InventoryDiagnostic, InventoryInstallation, InventoryManifest, InventoryRoot } from "../shared/inventory/manifest.ts";
import { inspectSkillFile } from "./skill-file.ts";

const MAX_DIRECTORY_DEPTH = 32;
const MAX_DIRECTORY_ENTRIES = 25_000;
const ignoredNames = new Set([".git", "node_modules"]);

type Selection = { defaults: boolean; project?: string; custom: string[] };
type HomePaths = { home: string; codexHome?: string };
type RootRequest = Pick<InventoryRoot, "kind" | "scope"> & { path: string };
type Unavailable = "missing" | "unreadable" | "skipped_link";
type InspectedRoot = { canonicalPath: string } | { unavailable: Unavailable };
type PreparedRoot = RootRequest & InspectedRoot & { id: string };
type DirectoryInspection = { entries: Dirent[] } | { error: InventoryDiagnostic["code"] };

export class InventoryError extends Error {}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function directoryStatus(path: string): Unavailable | undefined {
  try {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) return "skipped_link";
    if (!info.isDirectory()) return "unreadable";
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT" ? "missing" : "unreadable";
  }
}

/** Check ancestors first so lstat cannot inspect descendants of a linked root. */
export function inspectDirectoryPath(path: string): InspectedRoot {
  const base = parse(path).root;
  let current = base;
  const segments = path.slice(base.length).split(sep).filter(Boolean);
  for (const segment of ["", ...segments]) {
    if (segment) current = join(current, segment);
    const unavailable = directoryStatus(current);
    if (unavailable) return { unavailable };
  }
  try {
    return { canonicalPath: realpathSync.native(path) };
  } catch {
    return { unavailable: "unreadable" };
  }
}

function identity(domain: string, fields: string[]): string {
  return createHash("sha256").update(JSON.stringify([domain, ...fields])).digest("hex");
}

export function prepareInventoryRoots(selection: Selection, homePaths?: HomePaths): PreparedRoot[] {
  const requests: RootRequest[] = [];
  if (selection.defaults) {
    const home = homePaths?.home ?? homedir();
    const codexHome = (homePaths ? homePaths.codexHome : process.env.CODEX_HOME) || join(home, ".codex");
    requests.push(
      { kind: "shared", scope: "user", path: join(home, ".agents", "skills") },
      { kind: "codex", scope: "user", path: join(codexHome, "skills") },
      { kind: "claude-code", scope: "user", path: join(home, ".claude", "skills") },
      { kind: "cursor", scope: "user", path: join(home, ".cursor", "skills") },
    );
  }
  if (selection.project) {
    requests.push(
      { kind: "shared", scope: "project", path: join(selection.project, ".agents", "skills") },
      { kind: "claude-code", scope: "project", path: join(selection.project, ".claude", "skills") },
      { kind: "cursor", scope: "project", path: join(selection.project, ".cursor", "skills") },
    );
  }
  for (const path of selection.custom) requests.push({ kind: "custom", scope: "custom", path });

  const roots = new Map<string, PreparedRoot>();
  const inspected = new Map<string, InspectedRoot>();
  for (const { kind, scope, path: requested } of requests) {
    const path = resolve(requested);
    const inspection = inspected.get(path) ?? inspectDirectoryPath(path);
    inspected.set(path, inspection);
    const location = "canonicalPath" in inspection ? inspection.canonicalPath : path;
    const id = identity("skillhub:root:v1", [kind, scope, location]);
    roots.set(id, { kind, scope, path, ...inspection, id });
    if (roots.size > MAX_INVENTORY_ROOTS) throw new InventoryError("Select at most 32 distinct scan sources.");
  }
  if (roots.size === 0) throw new InventoryError("Select a project or root when using --no-defaults.");
  return [...roots.values()].sort((a, b) => compare(a.id, b.id));
}

export function scanInventory(sources: PreparedRoot[]): InventoryManifest {
  const diagnostics: InventoryDiagnostic[] = [];
  const installations = new Map<string, InventoryInstallation>();
  const directories = new Map<string, DirectoryInspection>();
  const files = new Map<string, ReturnType<typeof inspectSkillFile>>();
  let remainingEntries = MAX_DIRECTORY_ENTRIES;
  let omittedDiagnostics = 0;
  const roots: InventoryRoot[] = [];

  function report(root: InventoryRoot, code: InventoryDiagnostic["code"], path?: string) {
    if (root.status === "scanned") root.status = "partial";
    if (diagnostics.length === MAX_INVENTORY_DIAGNOSTICS) {
      omittedDiagnostics++;
      return;
    }
    const diagnostic: InventoryDiagnostic = { rootId: root.id, code };
    if (path && isInventoryRelativePath(path)) diagnostic.relativePath = path;
    diagnostics.push(diagnostic);
  }

  function readDirectory(directory: string): DirectoryInspection {
    if (remainingEntries === 0) return { error: "limit_reached" };
    try {
      const unavailable = directoryStatus(directory);
      if (unavailable === "skipped_link") return { error: "link_skipped" };
      if (unavailable) return { error: "directory_unreadable" };
      if (realpathSync.native(directory) !== directory) return { error: "link_skipped" };
      const handle = opendirSync(directory);
      try {
        const entries: Dirent[] = [];
        while (remainingEntries > 0) {
          const entry = handle.readSync();
          if (!entry) return { entries: entries.sort((a, b) => compare(a.name, b.name)) };
          remainingEntries--;
          entries.push(entry);
        }
        // At the budget we cannot confirm the listing is complete. Do not
        // choose a filesystem-dependent subset of this directory.
        return { error: "limit_reached" };
      } finally {
        handle.closeSync();
      }
    } catch {
      return { error: "directory_unreadable" };
    }
  }

  function visit(root: InventoryRoot, directory: string, localPath: string, depth: number): void {
    if (depth > MAX_DIRECTORY_DEPTH) {
      report(root, "limit_reached", localPath);
      return;
    }

    const listing = directories.get(directory) ?? readDirectory(directory);
    directories.set(directory, listing);
    if ("error" in listing) {
      if (depth === 0 && listing.error === "directory_unreadable") root.status = "unreadable";
      if (depth === 0 && listing.error === "link_skipped") root.status = "skipped_link";
      report(root, listing.error, localPath);
      return;
    }

    const skillFiles = listing.entries.filter((entry) => entry.isFile() && entry.name.toLowerCase() === "skill.md");
    if (skillFiles.length > 1) {
      report(root, "ambiguous_filename", localPath);
      return;
    }
    const within = (name: string) => localPath ? localPath + "/" + name : name;
    if (skillFiles.length === 1) {
      const name = skillFiles[0].name;
      const relativePath = within(name);
      if (!isInventoryRelativePath(relativePath, true)) {
        report(root, "invalid_file");
        return;
      }

      // The parent was checked before enumeration. The read also checks native
      // canonical equality so an ancestor change cannot redirect a normal scan.
      const file = join(directory, name);
      const metadata = files.get(file) ?? inspectSkillFile(file);
      files.set(file, metadata);
      if ("error" in metadata) {
        report(root, metadata.error, relativePath);
        return;
      }
      const existing = installations.get(file);
      const locator = { rootId: root.id, relativePath };
      if (existing) {
        existing.locations.push(locator);
      } else {
        if (installations.size === MAX_INVENTORY_INSTALLATIONS) {
          throw new InventoryError("The scan exceeds the 2,000-installation manifest limit. Select fewer sources.");
        }
        installations.set(file, { id: identity("skillhub:installation:v1", [file]), ...metadata.data, locations: [locator] });
      }
      return;
    }

    for (const entry of listing.entries) {
      const name = entry.name.toLowerCase();
      if (ignoredNames.has(name)) continue;
      const relativePath = within(entry.name);
      const isLink = entry.isSymbolicLink();
      if (name === "skill.md" && !isLink) report(root, "invalid_file", relativePath);
      if (!entry.isDirectory() && !isLink) continue;
      if (!isInventoryRelativePath(relativePath)) {
        report(root, "directory_unreadable");
      } else if (isLink) {
        report(root, "link_skipped", relativePath);
      } else {
        visit(root, join(directory, entry.name), relativePath, depth + 1);
      }
    }
  }

  for (const source of sources) {
    const root: InventoryRoot = { id: source.id, kind: source.kind, scope: source.scope, status: "scanned" };
    roots.push(root);
    if ("canonicalPath" in source) {
      visit(root, source.canonicalPath, "", 0);
    } else {
      root.status = source.unavailable;
      report(root, source.unavailable === "skipped_link" ? "link_skipped" : "root_unavailable");
    }
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    roots,
    installations: [...installations.values()].sort((a, b) => compare(a.id, b.id)),
    diagnostics: diagnostics.sort((a, b) => compare(a.rootId, b.rootId)
      || compare(a.relativePath ?? "", b.relativePath ?? "") || compare(a.code, b.code)),
    omittedDiagnostics,
  };
}

export type { PreparedRoot };
