import type { SkillContent } from "@/store/skillStore";

export const README_TARGET_LANGUAGE = "zh-CN";
export const README_PROMPT_VERSION = "readme-translate-v1";

export type ReadmeLanguage = "zh" | "original";
export type ReadmeTranslationUiStatus = "idle" | "loading" | "translated" | "error";

export interface ReadmeViewState {
  language: ReadmeLanguage;
  translatedMarkdown: string | null;
  status: ReadmeTranslationUiStatus;
  errorCode: string | null;
}

export type ReadmeViewAction =
  | { type: "reset" }
  | { type: "start" }
  | { type: "success"; content: string }
  | { type: "error"; code: string }
  | { type: "language"; language: ReadmeLanguage };

export function createReadmeViewState(): ReadmeViewState {
  return {
    language: "original",
    translatedMarkdown: null,
    status: "idle",
    errorCode: null,
  };
}

export function readmeViewReducer(
  state: ReadmeViewState,
  action: ReadmeViewAction,
): ReadmeViewState {
  switch (action.type) {
    case "reset":
      return createReadmeViewState();
    case "start":
      return { ...state, language: "original", status: "loading", errorCode: null };
    case "success":
      return {
        language: "zh",
        translatedMarkdown: action.content,
        status: "translated",
        errorCode: null,
      };
    case "error":
      return { ...state, language: "original", status: "error", errorCode: action.code };
    case "language":
      if (action.language === "zh" && !state.translatedMarkdown) return state;
      return { ...state, language: action.language };
  }
}

export function originalReadme(content: SkillContent): string {
  return content.readme_original ?? content.content;
}

export function displayedReadme(
  original: string,
  translated: string | null,
  language: ReadmeLanguage,
): string {
  return language === "zh" && translated ? translated : original;
}

export function normalizeReadmeForHash(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}

export async function hashReadme(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeReadmeForHash(content));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function readmeTranslationCacheKey(
  sourceHash: string,
  targetLanguage = README_TARGET_LANGUAGE,
  promptVersion = README_PROMPT_VERSION,
): string {
  return [promptVersion, targetLanguage, sourceHash].join("|");
}
