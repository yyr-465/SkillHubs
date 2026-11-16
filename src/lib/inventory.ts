import {
  MAX_INVENTORY_BYTES,
  validateInventoryManifest,
  type InventoryInstallation,
  type InventoryManifest,
} from "../../shared/inventory/manifest.ts";

export type InventoryImportError =
  | "too_large"
  | "read_failed"
  | "invalid_json"
  | "unsupported_version"
  | "invalid_manifest";

/** The browser's file size is in bytes. Check it before allocating a read buffer. */
export async function readInventory(file: Pick<Blob, "size" | "arrayBuffer">): Promise<
  | { ok: true; manifest: InventoryManifest }
  | { ok: false; error: InventoryImportError }
> {
  if (file.size > MAX_INVENTORY_BYTES) return { ok: false, error: "too_large" };

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, error: "read_failed" };
  }
  if (bytes.byteLength > MAX_INVENTORY_BYTES) return { ok: false, error: "too_large" };

  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  return validateInventoryManifest(data);
}

function normalizeText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\s\p{White_Space}]+/gu, " ").trim();
}

export function filterInstallations(installations: InventoryInstallation[], query: string, rootId: string) {
  const search = normalizeText(query);
  return installations.filter(({ name, description, locations }) => {
    if (rootId && !locations.some((location) => location.rootId === rootId)) return false;
    return !search
      || normalizeText(name).includes(search)
      || normalizeText(description).includes(search)
      || locations.some(({ relativePath }) => normalizeText(relativePath).includes(search));
  });
}

function addGroup(groups: Map<string, InventoryInstallation[]>, key: string, installation: InventoryInstallation) {
  const members = groups.get(key);
  if (members) members.push(installation);
  else groups.set(key, [installation]);
}

export function analyzeInventory(manifest: InventoryManifest) {
  const exact = new Map<string, InventoryInstallation[]>();
  const descriptions = new Map<string, InventoryInstallation[]>();
  const countsByRoot = new Map<string, number>();
  for (const installation of manifest.installations) {
    for (const rootId of new Set(installation.locations.map((location) => location.rootId))) {
      countsByRoot.set(rootId, (countsByRoot.get(rootId) ?? 0) + 1);
    }
    addGroup(exact, installation.skillMdSha256, installation);
    const description = normalizeText(installation.description);
    if ((description.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 32) {
      addGroup(descriptions, description, installation);
    }
  }

  return {
    installationCount: manifest.installations.length,
    contentCount: exact.size,
    sourceCount: manifest.roots.filter(({ status }) => status === "scanned" || status === "partial").length,
    countsByRoot,
    identicalFiles: [...exact].filter(([, members]) => members.length >= 2),
    matchingDescriptions: [...descriptions].filter(([, members]) =>
      members.some((member) => member.skillMdSha256 !== members[0].skillMdSha256)),
  };
}
