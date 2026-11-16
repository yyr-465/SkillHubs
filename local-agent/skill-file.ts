import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { TextDecoder } from "node:util";
import { FAILSAFE_SCHEMA, load } from "js-yaml";
import { inventoryManifestSchema } from "../shared/inventory/manifest.ts";
import type { InventoryInstallation } from "../shared/inventory/manifest.ts";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_YAML_BYTES = 32 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: true });
const limits = inventoryManifestSchema.properties.installations.items.properties;

type Metadata = Pick<InventoryInstallation, "name" | "description" | "compatibility">;
type SkillFile =
  | { data: Metadata & { skillMdSha256: string } }
  | { error: "invalid_file" | "invalid_front_matter" | "limit_reached" | "link_skipped" };

function readSkillFile(file: string): { bytes: Buffer } | Extract<SkillFile, { error: string }> {
  try {
    const candidate = lstatSync(file, { bigint: true });
    if (candidate.isSymbolicLink()) return { error: "link_skipped" };
    if (!candidate.isFile()) return { error: "invalid_file" };
    if (realpathSync.native(file) !== file) return { error: "link_skipped" };
    if (candidate.size > MAX_FILE_BYTES) return { error: "limit_reached" };

    const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const opened = fstatSync(fd, { bigint: true });
      if (!opened.isFile() || opened.dev !== candidate.dev || opened.ino !== candidate.ino) {
        return { error: "invalid_file" };
      }
      if (opened.size > MAX_FILE_BYTES) return { error: "limit_reached" };
      const bytes = Buffer.alloc(Number(opened.size));
      let offset = 0;
      while (offset < bytes.length) {
        const read = readSync(fd, bytes, offset, bytes.length - offset, offset);
        if (read === 0) return { error: "invalid_file" };
        offset += read;
      }
      const after = fstatSync(fd, { bigint: true });
      if (opened.size !== after.size || opened.mtimeNs !== after.mtimeNs || opened.ctimeNs !== after.ctimeNs) {
        return { error: "invalid_file" };
      }
      return { bytes };
    } finally {
      closeSync(fd);
    }
  } catch {
    return { error: "invalid_file" };
  }
}

function scalar(mapping: object, key: keyof Metadata): string | undefined {
  const raw: unknown = Object.getOwnPropertyDescriptor(mapping, key)?.value;
  if (typeof raw !== "string") return;
  const value = raw.trim();
  if (value && [...value].length <= limits[key].maxLength) return value;
}

export function inspectSkillFile(file: string): SkillFile {
  const result = readSkillFile(file);
  if ("error" in result) return result;

  let text: string;
  try {
    text = utf8.decode(result.bytes);
  } catch {
    return { error: "invalid_file" };
  }
  const opening = /^---[ \t]*\r?\n/.exec(text);
  if (!opening) return { error: "invalid_front_matter" };
  const remainder = text.slice(opening[0].length);
  const closing = /(?:^|\n)---[ \t]*(?=\r?\n|$)/.exec(remainder);
  if (!closing) return { error: "invalid_front_matter" };
  const yaml = remainder.slice(0, closing.index + Number(closing[0].startsWith("\n")));
  if (Buffer.byteLength(yaml) > MAX_YAML_BYTES) return { error: "limit_reached" };

  let metadata: unknown;
  try {
    metadata = load(yaml, { schema: FAILSAFE_SCHEMA, maxAliases: 0, maxDepth: 16 });
  } catch {
    return { error: "invalid_front_matter" };
  }
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return { error: "invalid_front_matter" };
  }
  const name = scalar(metadata, "name");
  const description = scalar(metadata, "description");
  if (!name || !description) return { error: "invalid_front_matter" };
  const compatibility = scalar(metadata, "compatibility");
  return {
    data: {
      name,
      description,
      ...(compatibility === undefined ? {} : { compatibility }),
      skillMdSha256: createHash("sha256").update(result.bytes).digest("hex"),
    },
  };
}
