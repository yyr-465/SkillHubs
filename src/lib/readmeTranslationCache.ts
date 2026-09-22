import { readmeTranslationCacheKey } from "./readme.ts";

const DB_NAME = "skillhub-readme-translations";
const DB_VERSION = 1;
const STORE_NAME = "translations";

export interface ReadmeTranslationRecord {
  cacheKey: string;
  sourceHash: string;
  targetLanguage: string;
  promptVersion: string;
  translatedMarkdown: string;
  translatedAt: string;
  skillId?: string;
}

export interface ReadmeTranslationCache {
  get(
    sourceHash: string,
    targetLanguage: string,
    promptVersion: string,
  ): Promise<ReadmeTranslationRecord | null>;
  put(record: ReadmeTranslationRecord): Promise<void>;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("IndexedDB is unavailable."));
  }
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

function isTranslationRecord(value: unknown): value is ReadmeTranslationRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<ReadmeTranslationRecord>;
  return (
    typeof record.cacheKey === "string" &&
    typeof record.sourceHash === "string" &&
    typeof record.targetLanguage === "string" &&
    typeof record.promptVersion === "string" &&
    typeof record.translatedMarkdown === "string" &&
    record.translatedMarkdown.trim().length > 0 &&
    typeof record.translatedAt === "string"
  );
}

export const indexedDbReadmeTranslationCache: ReadmeTranslationCache = {
  async get(sourceHash, targetLanguage, promptVersion) {
    const db = await openDatabase();
    try {
      const key = readmeTranslationCacheKey(sourceHash, targetLanguage, promptVersion);
      return await new Promise((resolve, reject) => {
        const request = db
          .transaction(STORE_NAME, "readonly")
          .objectStore(STORE_NAME)
          .get(key);
        request.onsuccess = () => {
          const value: unknown = request.result;
          if (
            !isTranslationRecord(value) ||
            value.sourceHash !== sourceHash ||
            value.targetLanguage !== targetLanguage ||
            value.promptVersion !== promptVersion
          ) {
            resolve(null);
            return;
          }
          resolve(value);
        };
        request.onerror = () => reject(request.error ?? new Error("Failed to read translation cache."));
      });
    } finally {
      db.close();
    }
  },

  async put(record) {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("Failed to write translation cache."));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error("Translation cache write was aborted."));
      });
    } finally {
      db.close();
    }
  },
};
