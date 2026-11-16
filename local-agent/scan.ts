import { closeSync, fstatSync, lstatSync, openSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import type { BigIntStats } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { isInventoryRelativePath, MAX_INVENTORY_BYTES, validateInventoryManifest } from "../shared/inventory/manifest.ts";
import { inspectDirectoryPath, InventoryError, prepareInventoryRoots, scanInventory } from "./inventory.ts";
import type { PreparedRoot } from "./inventory.ts";

function scanOptions(args: string[]) {
  try {
    const { values, tokens } = parseArgs({
      args,
      options: {
        "no-defaults": { type: "boolean" },
        project: { type: "string" },
        root: { type: "string", multiple: true },
        output: { type: "string" },
      },
      strict: true,
      tokens: true,
    });
    const namedOnce = new Set<string>();
    for (const token of tokens) {
      if (token.kind !== "option" || token.name === "root") continue;
      if (namedOnce.has(token.name)) throw new Error();
      namedOnce.add(token.name);
    }
    if (!values.output?.trim() || values.project?.trim() === "" || values.root?.some((item) => !item.trim())) {
      throw new Error();
    }
    return {
      output: values.output,
      defaults: !values["no-defaults"],
      project: values.project,
      custom: values.root ?? [],
    };
  } catch {
    throw new InventoryError("Usage: pnpm run inventory:scan [--no-defaults] [--project DIR] [--root DIR]... --output NEW_FILE");
  }
}

function within(root: string, destination: string): boolean {
  const offset = relative(root, destination);
  return offset !== ".." && !offset.startsWith(".." + sep) && !isAbsolute(offset);
}

function prepareOutput(output: string, sources: PreparedRoot[]): string {
  const requested = resolve(output);
  const name = basename(requested);
  const windowsNameInvalid = process.platform === "win32"
    && (/[<>:"|?*]|[ .]$/.test(name)
      || /^(?:CON|CONIN\$|CONOUT\$|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:[ .]|$)/i.test(name));
  if (!isInventoryRelativePath(name) || windowsNameInvalid || output.endsWith(sep)
    || (process.platform === "win32" && output.endsWith("/"))) {
    throw new InventoryError("Choose a new output file.");
  }

  let parent: string;
  try {
    parent = realpathSync.native(dirname(requested));
  } catch {
    throw new InventoryError("The output directory is unavailable. Choose an existing directory.");
  }
  const checkedParent = inspectDirectoryPath(parent);
  if (!("canonicalPath" in checkedParent) || checkedParent.canonicalPath !== parent) {
    throw new InventoryError("The output directory is unavailable.");
  }

  const target = join(parent, name);
  for (const source of sources) {
    if (within(source.path, requested) || within(source.path, target)
      || ("canonicalPath" in source && within(source.canonicalPath, target))) {
      throw new InventoryError("Choose an output file outside every scan root.");
    }
  }
  return target;
}

function writeExclusive(target: string, json: string): void {
  let fd: number;
  try {
    fd = openSync(target, "wx", 0o600);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new InventoryError("The output file already exists. Choose a new filename.");
    }
    throw new InventoryError("Could not create the output file.");
  }

  let created: BigIntStats | undefined;
  try {
    try {
      created = fstatSync(fd, { bigint: true });
      if (!created.isFile() || realpathSync.native(target) !== target) throw new Error();
      writeFileSync(fd, json, "utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    try {
      const current = lstatSync(target, { bigint: true });
      // Only remove the directory entry if it still refers to this export.
      if (created && created.ino !== 0n && current.isFile()
        && current.dev === created.dev && current.ino === created.ino && realpathSync.native(target) === target) {
        unlinkSync(target);
      }
    } catch {
      // Cleanup is best effort when the file or its parent has changed.
    }
    throw new InventoryError("Could not finish writing the output file.");
  }
}

function consolePath(path: string): string {
  return JSON.stringify(path).replace(/[\u007f-\u009f\u2028-\u202e\u2066-\u2069]/g,
    (character) => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
}

function main() {
  const options = scanOptions(process.argv.slice(2));
  const sources = prepareInventoryRoots(options);
  const target = prepareOutput(options.output, sources);
  const manifest = scanInventory(sources);
  if (!validateInventoryManifest(manifest).ok) throw new InventoryError("The scan did not produce a valid V1 inventory.");
  const json = JSON.stringify(manifest) + "\n";
  if (Buffer.byteLength(json) > MAX_INVENTORY_BYTES) {
    throw new InventoryError("The inventory exceeds 8 MiB. Select fewer sources.");
  }
  if (prepareOutput(options.output, sources) !== target) throw new InventoryError("The output location changed.");
  writeExclusive(target, json);

  console.log("Wrote inventory: " + manifest.installations.length + " installations, "
    + (manifest.diagnostics.length + manifest.omittedDiagnostics) + " diagnostics.");
  console.log("Local scan directories (match by source ID):");
  for (const [index, source] of sources.entries()) {
    const status = manifest.roots[index].status;
    const path = "canonicalPath" in source ? source.canonicalPath : source.path;
    console.log("  " + source.id + " " + source.kind + "/" + source.scope + " " + status + " " + consolePath(path));
  }
  console.log("The manifest contains local metadata and relative paths. Review it before sharing.");
}

try {
  main();
} catch (error) {
  const detail = error instanceof InventoryError ? error.message : "An unexpected scan or write error occurred.";
  console.error("Inventory export failed. " + detail);
  process.exitCode = 1;
}
