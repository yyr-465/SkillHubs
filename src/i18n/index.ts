import { useCallback, useSyncExternalStore } from "react";
import zh from "./zh.json";
import en from "./en.json";

// ── Translation dictionary ──────────────────────────────────────

export type LangCode = "zh" | "en";

const dicts: Record<LangCode, Record<string, string>> = { zh, en };

// ── Global language store (simple, to avoid circular deps) ───────

let currentLang: LangCode = "en";
const listeners = new Set<() => void>();

export function getCurrentLang(): LangCode {
  return currentLang;
}

export function setCurrentLang(lang: LangCode) {
  currentLang = lang;
  listeners.forEach((fn) => fn());
}

function subscribeToLang(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ── Hook ─────────────────────────────────────────────────────────

export function useTranslation() {
  const lang = useSyncExternalStore(subscribeToLang, getCurrentLang);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const dict = dicts[lang];
      return dict[key] ?? fallback ?? key;
    },
    [lang],
  );

  return { t, lang };
}

/** Plain-text helper for places you cannot use a hook (e.g. outside React). */
export function translate(key: string, fallback?: string): string {
  const dict = dicts[currentLang];
  return dict[key] ?? fallback ?? key;
}
