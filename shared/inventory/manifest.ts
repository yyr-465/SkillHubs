export const MAX_INVENTORY_BYTES = 8 * 1024 * 1024;
export const MAX_INVENTORY_ROOTS = 32;
export const MAX_INVENTORY_INSTALLATIONS = 2_000;
export const MAX_INVENTORY_DIAGNOSTICS = 1_000;

type Schema =
  | { const: number }
  | { type: "string"; enum?: readonly string[]; minLength?: number; maxLength?: number; pattern?: string }
  | { type: "integer"; minimum: number; maximum: number }
  | { type: "array"; items: Schema; minItems: number; maxItems: number }
  | {
    type: "object";
    properties: Record<string, Schema>;
    required: readonly string[];
    additionalProperties: false;
  };

type Infer<S extends Schema> =
  S extends { const: infer C } ? C
    : S extends { enum: readonly (infer E)[] } ? E
    : S extends { type: "string" } ? string
    : S extends { type: "integer" } ? number
    : S extends { type: "array"; items: infer I extends Schema } ? Infer<I>[]
    : S extends { type: "object"; properties: infer P extends Record<string, Schema>; required: readonly (infer R)[] }
      ? { [K in keyof P & R]: Infer<P[K]> } & { [K in Exclude<keyof P, R>]?: Infer<P[K]> }
      : never;

function closed<const P extends Record<string, Schema>, const O extends readonly (keyof P & string)[] = []>(
  properties: P,
  optional?: O,
) {
  const optionalKeys = new Set<string>(optional);
  const required = Object.keys(properties).filter((key) => !optionalKeys.has(key)) as Exclude<keyof P, O[number]>[];
  return { type: "object", properties, required, additionalProperties: false } as const;
}

const end = "(?![\\s\\S])"; // Unlike $, this cannot match before a final line break.
const segment = "(?!\\.{1,2}(?:/|" + end + "))[^/\\\\:\\u0000-\\u001f\\u007f-\\u009f]+";
const relativePath = {
  type: "string",
  maxLength: 1_024,
  pattern: "^" + segment + "(?:/" + segment + ")*" + end,
} as const;
const skillPath = {
  ...relativePath,
  pattern: "^(?=(?:[^/]+/)*[Ss][Kk][Ii][Ll][Ll]\\.[Mm][Dd]" + end + ")" + relativePath.pattern.slice(1),
} as const;
const digest = { type: "string", pattern: "^[a-f0-9]{64}" + end } as const;
const trimmed = (maxLength: number) => ({
  type: "string", minLength: 1, maxLength, pattern: "^(?!\\s)[\\s\\S]*\\S" + end,
} as const);

const root = closed({
  id: digest,
  kind: { type: "string", enum: ["shared", "codex", "claude-code", "cursor", "custom"] },
  scope: { type: "string", enum: ["user", "project", "custom"] },
  status: { type: "string", enum: ["scanned", "partial", "missing", "unreadable", "skipped_link"] },
});
const location = closed({ rootId: digest, relativePath: skillPath });
const installation = closed({
  id: digest,
  skillMdSha256: digest,
  name: trimmed(128),
  description: trimmed(2_048),
  compatibility: trimmed(512),
  locations: { type: "array", items: location, minItems: 1, maxItems: MAX_INVENTORY_ROOTS },
}, ["compatibility"]);
const diagnostic = closed({
  rootId: digest,
  code: {
    type: "string",
    enum: [
      "root_unavailable", "directory_unreadable", "link_skipped", "invalid_file",
      "ambiguous_filename", "invalid_front_matter", "limit_reached",
    ],
  },
  relativePath,
}, ["relativePath"]);

export const inventoryManifestSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "SkillHub inventory V1",
  ...closed({
    schemaVersion: { const: 1 },
    generatedAt: {
      type: "string",
      pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z" + end,
    },
    roots: { type: "array", items: root, minItems: 1, maxItems: MAX_INVENTORY_ROOTS },
    installations: { type: "array", items: installation, minItems: 0, maxItems: MAX_INVENTORY_INSTALLATIONS },
    diagnostics: { type: "array", items: diagnostic, minItems: 0, maxItems: MAX_INVENTORY_DIAGNOSTICS },
    omittedDiagnostics: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  }),
} as const;

export type InventoryManifest = Infer<typeof inventoryManifestSchema>;
export type InventoryRoot = InventoryManifest["roots"][number];
export type InventoryInstallation = InventoryManifest["installations"][number];
export type InventoryDiagnostic = InventoryManifest["diagnostics"][number];
export type InventoryLocation = InventoryInstallation["locations"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

// Interpret the fixed V1 keywords directly so the same validation works under Web CSP.
const patterns = new Map<string, RegExp>();
function checkSchema<S extends Schema>(schema: S, value: unknown): value is Infer<S> {
  if ("const" in schema) return value === schema.const;
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") return false;
      if (schema.enum && !schema.enum.includes(value)) return false;
      if (schema.minLength !== undefined || schema.maxLength !== undefined) {
        if (schema.maxLength !== undefined && value.length > 2 * schema.maxLength) return false;
        const length = [...value].length;
        if (length < (schema.minLength ?? 0) || length > (schema.maxLength ?? Infinity)) return false;
      }
      if (!schema.pattern) return true;
      const pattern = patterns.get(schema.pattern) ?? new RegExp(schema.pattern, "u");
      patterns.set(schema.pattern, pattern);
      return pattern.test(value);
    }
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value) && value >= schema.minimum && value <= schema.maximum;
    case "array":
      if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) return false;
      for (const item of value) if (!checkSchema(schema.items, item)) return false;
      return true;
    case "object":
      return isRecord(value)
        && schema.required.every((key) => Object.hasOwn(value, key))
        && Object.keys(value).every((key) =>
          Object.hasOwn(schema.properties, key) && checkSchema(schema.properties[key], value[key]));
  }
}

export function isInventoryRelativePath(path: string, skillFile = false): boolean {
  return checkSchema(skillFile ? skillPath : relativePath, path);
}

export function validateInventoryManifest(value: unknown):
  | { ok: true; manifest: InventoryManifest }
  | { ok: false; error: "unsupported_version" | "invalid_manifest" } {
  const invalid = { ok: false, error: "invalid_manifest" } as const;
  if (isRecord(value) && Object.hasOwn(value, "schemaVersion")
    && Number.isSafeInteger(value.schemaVersion) && value.schemaVersion !== 1) {
    return { ok: false, error: "unsupported_version" };
  }
  if (!checkSchema(inventoryManifestSchema, value)) return invalid;
  const time = new Date(value.generatedAt);
  if (!Number.isFinite(time.getTime()) || time.toISOString() !== value.generatedAt) return invalid;

  const roots = new Map<string, InventoryRoot>();
  for (const entry of value.roots) {
    if (roots.has(entry.id) || (entry.kind === "custom") !== (entry.scope === "custom")
      || (entry.kind === "codex" && entry.scope !== "user")) return invalid;
    roots.set(entry.id, entry);
  }
  const installations = new Set<string>();
  const locators = new Set<string>();
  for (const entry of value.installations) {
    if (installations.has(entry.id)) return invalid;
    installations.add(entry.id);
    for (const { rootId, relativePath } of entry.locations) {
      const source = roots.get(rootId);
      const key = rootId + "/" + relativePath;
      if ((source?.status !== "scanned" && source?.status !== "partial") || locators.has(key)) return invalid;
      locators.add(key);
    }
  }
  if (value.diagnostics.some(({ rootId }) => !roots.has(rootId))) return invalid;
  return { ok: true, manifest: value };
}
