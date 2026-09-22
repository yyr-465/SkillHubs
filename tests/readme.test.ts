import assert from "node:assert/strict";
import {
  createReadmeViewState,
  displayedReadme,
  hashReadme,
  originalReadme,
  readmeTranslationCacheKey,
  readmeViewReducer,
  README_PROMPT_VERSION,
  README_TARGET_LANGUAGE,
} from "../src/lib/readme.ts";
import {
  needsLocalTranslationConsent,
  translateReadmeWithCache,
} from "../src/lib/readmeTranslation.ts";
import {
  createReadmeTranslationProvider,
  ReadmeTranslationError,
  translationApiOrigin,
  type ReadmeTranslationProvider,
} from "../src/lib/readmeTranslationApi.ts";
import type {
  ReadmeTranslationCache,
  ReadmeTranslationRecord,
} from "../src/lib/readmeTranslationCache.ts";
import type { SkillContent } from "../src/store/skillStore.ts";

class MemoryCache implements ReadmeTranslationCache {
  readonly records = new Map<string, ReadmeTranslationRecord>();

  async get(sourceHash: string, targetLanguage: string, promptVersion: string) {
    return this.records.get(
      readmeTranslationCacheKey(sourceHash, targetLanguage, promptVersion),
    ) ?? null;
  }

  async put(record: ReadmeTranslationRecord) {
    this.records.set(record.cacheKey, record);
  }
}

function successfulProvider(
  translatedMarkdown: string,
  calls: Array<string>,
): ReadmeTranslationProvider {
  return async (request) => {
    calls.push(request.sourceHash);
    return {
      content: translatedMarkdown,
      sourceHash: request.sourceHash,
      targetLanguage: request.targetLanguage,
      promptVersion: request.promptVersion,
    };
  };
}

const legacyDesktop: SkillContent = {
  id: "desktop-demo",
  name: "Desktop Demo",
  content: "# Legacy desktop README",
};
assert.equal(originalReadme(legacyDesktop), "# Legacy desktop README");

const webContent: SkillContent = {
  id: "catalog-demo",
  name: "Catalog Demo",
  content: "# Alias",
  readme_original: "# Original",
};
assert.equal(originalReadme(webContent), "# Original");
assert.equal(displayedReadme("# Original", null, "zh"), "# Original");
assert.equal(displayedReadme("# Original", "# 中文", "zh"), "# 中文");
assert.equal(displayedReadme("# Original", "# 中文", "original"), "# Original");

let viewState = createReadmeViewState();
assert.equal(viewState.language, "original");
assert.equal(viewState.status, "idle");
viewState = readmeViewReducer(viewState, { type: "start" });
assert.equal(viewState.status, "loading");
assert.equal(viewState.language, "original");
viewState = readmeViewReducer(viewState, { type: "success", content: "# 中文" });
assert.equal(viewState.status, "translated");
assert.equal(viewState.language, "zh");
viewState = readmeViewReducer(viewState, {
  type: "language",
  language: "original",
});
assert.equal(viewState.language, "original");
viewState = readmeViewReducer(viewState, { type: "language", language: "zh" });
assert.equal(viewState.language, "zh");
viewState = readmeViewReducer(viewState, { type: "reset" });
assert.deepEqual(viewState, createReadmeViewState());
viewState = readmeViewReducer(viewState, { type: "start" });
viewState = readmeViewReducer(viewState, {
  type: "error",
  code: "request-failed",
});
assert.equal(viewState.status, "error");
assert.equal(viewState.language, "original");

const originalMarkdown =
  "# Demo\n\n```sh\necho ok\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n![Image](https://example.com/a.png)\n\n[Link](https://example.com)";
const translatedMarkdown =
  "# 演示\n\n```sh\necho ok\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n![图片](https://example.com/a.png)\n\n[链接](https://example.com)";
const originalHash = await hashReadme(originalMarkdown);
assert.equal(originalHash.length, 64);
assert.equal(await hashReadme(originalMarkdown + "\n"), originalHash);
assert.notEqual(await hashReadme(originalMarkdown + "\nChanged"), originalHash);

const key = readmeTranslationCacheKey(originalHash);
assert.equal(
  key,
  `${README_PROMPT_VERSION}|${README_TARGET_LANGUAGE}|${originalHash}`,
);
assert.equal(key.includes("catalog-demo"), false);

const cache = new MemoryCache();
const providerCalls: string[] = [];
const provider = successfulProvider(translatedMarkdown, providerCalls);

const first = await translateReadmeWithCache({
  skillId: "catalog-demo",
  originalMarkdown,
  cache,
  provider,
  now: () => new Date("2026-09-21T00:00:00.000Z"),
});
assert.equal(first.fromCache, false);
assert.equal(first.translatedMarkdown, translatedMarkdown);
assert.equal(providerCalls.length, 1);
assert.match(first.translatedMarkdown, /```sh\necho ok/);
assert.match(first.translatedMarkdown, /\| A \| B \|/);
assert.match(first.translatedMarkdown, /!\[图片\]\(https:\/\/example.com\/a.png\)/);
assert.match(first.translatedMarkdown, /\[链接\]\(https:\/\/example.com\)/);

const cached = await translateReadmeWithCache({
  skillId: "different-id",
  originalMarkdown,
  cache,
  provider,
});
assert.equal(cached.fromCache, true);
assert.equal(providerCalls.length, 1);

const changed = await translateReadmeWithCache({
  skillId: "catalog-demo",
  originalMarkdown: originalMarkdown + "\nChanged",
  cache,
  provider,
});
assert.equal(changed.fromCache, false);
assert.equal(providerCalls.length, 2);
assert.notEqual(changed.sourceHash, first.sourceHash);

const sameIdDifferentContent = await translateReadmeWithCache({
  skillId: "catalog-demo",
  originalMarkdown: "# Entirely different README",
  cache,
  provider,
});
assert.equal(sameIdDifferentContent.fromCache, false);
assert.equal(providerCalls.length, 3);

const localSkill = await translateReadmeWithCache({
  skillId: "local-skill",
  originalMarkdown,
  cache,
  provider,
});
assert.equal(localSkill.fromCache, true);
assert.equal(providerCalls.length, 3);
assert.equal(needsLocalTranslationConsent(false, false), false);
assert.equal(needsLocalTranslationConsent(true, false), true);
assert.equal(needsLocalTranslationConsent(true, true), false);

let retryAttempts = 0;
const retryProvider: ReadmeTranslationProvider = async (request) => {
  retryAttempts += 1;
  if (retryAttempts === 1) throw new Error("temporary failure");
  return {
    content: "# 重试成功",
    sourceHash: request.sourceHash,
    targetLanguage: request.targetLanguage,
    promptVersion: request.promptVersion,
  };
};
const retryCache = new MemoryCache();
await assert.rejects(
  translateReadmeWithCache({
    skillId: "retry",
    originalMarkdown: "# Retry",
    cache: retryCache,
    provider: retryProvider,
  }),
);
const retried = await translateReadmeWithCache({
  skillId: "retry",
  originalMarkdown: "# Retry",
  cache: retryCache,
  provider: retryProvider,
});
assert.equal(retried.translatedMarkdown, "# 重试成功");
assert.equal(retryAttempts, 2);

await assert.rejects(
  translateReadmeWithCache({
    skillId: "empty",
    originalMarkdown: "   ",
    cache: new MemoryCache(),
    provider,
  }),
);

let apiRequestBody = "";
const apiProvider = createReadmeTranslationProvider({
  endpoint: "https://translate.example.com/api/translate-readme",
  fetchImpl: async (_input, init) => {
    apiRequestBody = String(init?.body ?? "");
    const request = JSON.parse(apiRequestBody) as {
      sourceHash: string;
      targetLanguage: typeof README_TARGET_LANGUAGE;
      promptVersion: typeof README_PROMPT_VERSION;
    };
    return new Response(
      JSON.stringify({
        content: "# API 中文",
        sourceHash: request.sourceHash,
        targetLanguage: request.targetLanguage,
        promptVersion: request.promptVersion,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  },
});
const apiResult = await apiProvider({
  content: "# API",
  sourceHash: await hashReadme("# API"),
  targetLanguage: README_TARGET_LANGUAGE,
  promptVersion: README_PROMPT_VERSION,
});
assert.equal(apiResult.content, "# API 中文");
assert.match(apiRequestBody, /"promptVersion":"readme-translate-v1"/);

await assert.rejects(
  createReadmeTranslationProvider({ endpoint: "" })({
    content: "# Missing",
    sourceHash: "hash",
    targetLanguage: README_TARGET_LANGUAGE,
    promptVersion: README_PROMPT_VERSION,
  }),
  (error: unknown) =>
    error instanceof ReadmeTranslationError && error.code === "not-configured",
);

assert.equal(
  translationApiOrigin("https://translate.example.com/api/translate-readme"),
  "https://translate.example.com",
);
assert.equal(translationApiOrigin("http://translate.example.com/api"), null);
assert.equal(translationApiOrigin("http://localhost:8787/api"), null);

console.log("README on-demand translation tests passed.");
