import {
  hashReadme,
  readmeTranslationCacheKey,
  README_PROMPT_VERSION,
  README_TARGET_LANGUAGE,
} from "./readme.ts";
import {
  indexedDbReadmeTranslationCache,
  type ReadmeTranslationCache,
  type ReadmeTranslationRecord,
} from "./readmeTranslationCache.ts";
import {
  translateReadme,
  type ReadmeTranslationProvider,
} from "./readmeTranslationApi.ts";

const LOCAL_TRANSLATION_CONSENT_KEY = "skillhub_local_readme_translation_consent_v1";

export interface TranslateReadmeOptions {
  skillId: string;
  originalMarkdown: string;
  cache?: ReadmeTranslationCache;
  provider?: ReadmeTranslationProvider;
  now?: () => Date;
}

export interface TranslateReadmeResult {
  translatedMarkdown: string;
  sourceHash: string;
  fromCache: boolean;
}

export async function translateReadmeWithCache({
  skillId,
  originalMarkdown,
  cache = indexedDbReadmeTranslationCache,
  provider = translateReadme,
  now = () => new Date(),
}: TranslateReadmeOptions): Promise<TranslateReadmeResult> {
  if (!originalMarkdown.trim()) throw new Error("README is empty.");
  const sourceHash = await hashReadme(originalMarkdown);

  let cached: ReadmeTranslationRecord | null = null;
  try {
    cached = await cache.get(
      sourceHash,
      README_TARGET_LANGUAGE,
      README_PROMPT_VERSION,
    );
  } catch {
    // Translation remains available when private browsing or quotas disable IDB.
  }
  if (cached) {
    return {
      translatedMarkdown: cached.translatedMarkdown,
      sourceHash,
      fromCache: true,
    };
  }

  const response = await provider({
    content: originalMarkdown,
    sourceHash,
    targetLanguage: README_TARGET_LANGUAGE,
    promptVersion: README_PROMPT_VERSION,
  });
  const record: ReadmeTranslationRecord = {
    cacheKey: readmeTranslationCacheKey(
      sourceHash,
      README_TARGET_LANGUAGE,
      README_PROMPT_VERSION,
    ),
    sourceHash,
    targetLanguage: README_TARGET_LANGUAGE,
    promptVersion: README_PROMPT_VERSION,
    translatedMarkdown: response.content,
    translatedAt: now().toISOString(),
    skillId,
  };
  try {
    await cache.put(record);
  } catch {
    // A cache failure must not discard a translation the user already received.
  }
  return {
    translatedMarkdown: response.content,
    sourceHash,
    fromCache: false,
  };
}

export function needsLocalTranslationConsent(
  isLocalSkill: boolean,
  consentGranted: boolean,
): boolean {
  return isLocalSkill && !consentGranted;
}

export function hasLocalTranslationConsent(): boolean {
  try {
    return localStorage.getItem(LOCAL_TRANSLATION_CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

export function grantLocalTranslationConsent(): void {
  try {
    localStorage.setItem(LOCAL_TRANSLATION_CONSENT_KEY, "granted");
  } catch {
    // The confirmation still applies to the current action if storage is blocked.
  }
}
