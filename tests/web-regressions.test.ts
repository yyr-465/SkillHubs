import assert from "node:assert/strict";
import { syncDocumentLanguage } from "../src/i18n/syncDocumentLanguage.ts";
import { localSkillId } from "../src/lib/localSkillId.ts";

const root = { lang: "en" };
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { documentElement: root },
});

syncDocumentLanguage("zh");
assert.equal(root.lang, "zh-CN");
syncDocumentLanguage("en");
assert.equal(root.lang, "en");
delete (globalThis as { document?: unknown }).document;

const duplicateLeafPaths = [
  "LocalSkills/shared/SKILL.md",
  "LocalSkills/nested/shared/SKILL.md",
];
const localIds = duplicateLeafPaths.map(localSkillId);
assert.equal(new Set(localIds).size, duplicateLeafPaths.length);
assert.ok(localIds.every((id) => id.startsWith("_local_")));
assert.ok(localIds.every((id) => !/[/%]/.test(id)));

console.log("Web language and local Skill identity regression tests passed.");
