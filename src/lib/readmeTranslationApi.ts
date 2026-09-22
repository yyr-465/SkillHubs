import {
  README_PROMPT_VERSION,
  README_TARGET_LANGUAGE,
} from "./readme.ts";

export interface TranslateReadmeRequest {
  content: string;
  sourceHash: string;
  targetLanguage: typeof README_TARGET_LANGUAGE;
  promptVersion: typeof README_PROMPT_VERSION;
}

export interface TranslateReadmeResponse {
  content: string;
  sourceHash: string;
  targetLanguage: typeof README_TARGET_LANGUAGE;
  promptVersion: typeof README_PROMPT_VERSION;
}

export type ReadmeTranslationProvider = (
  request: TranslateReadmeRequest,
) => Promise<TranslateReadmeResponse>;

export type ReadmeTranslationErrorCode =
  | "not-configured"
  | "invalid-endpoint"
  | "request-failed"
  | "invalid-response";

export class ReadmeTranslationError extends Error {
  readonly code: ReadmeTranslationErrorCode;

  constructor(code: ReadmeTranslationErrorCode) {
    super(code);
    this.name = "ReadmeTranslationError";
    this.code = code;
  }
}

function configuredEndpoint(): string {
  return import.meta.env?.VITE_TRANSLATION_API_URL?.trim() ?? "";
}

function parseEndpoint(rawEndpoint: string): URL {
  if (!rawEndpoint) throw new ReadmeTranslationError("not-configured");
  const base = typeof window === "undefined" ? "https://localhost/" : window.location.href;
  let url: URL;
  try {
    url = new URL(rawEndpoint, base);
  } catch {
    throw new ReadmeTranslationError("invalid-endpoint");
  }
  const localDevelopment =
    import.meta.env?.DEV === true &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    url.protocol === "http:";
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new ReadmeTranslationError("invalid-endpoint");
  }
  return url;
}

function validatedEndpoint(rawEndpoint: string): string {
  return parseEndpoint(rawEndpoint).toString();
}

export function translationApiOrigin(rawEndpoint: string): string | null {
  try {
    return parseEndpoint(rawEndpoint).origin;
  } catch {
    return null;
  }
}

export function configuredTranslationApiOrigin(): string | null {
  return translationApiOrigin(configuredEndpoint());
}

export function createReadmeTranslationProvider(options?: {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): ReadmeTranslationProvider {
  return async (request) => {
    const endpoint = validatedEndpoint(options?.endpoint ?? configuredEndpoint());
    const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(
      () => controller.abort(),
      options?.timeoutMs ?? 60_000,
    );
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch {
      throw new ReadmeTranslationError("request-failed");
    } finally {
      globalThis.clearTimeout(timeout);
    }
    if (!response.ok) throw new ReadmeTranslationError("request-failed");

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ReadmeTranslationError("invalid-response");
    }
    if (typeof data !== "object" || data === null) {
      throw new ReadmeTranslationError("invalid-response");
    }
    const result = data as Partial<TranslateReadmeResponse>;
    if (
      typeof result.content !== "string" ||
      result.content.trim().length === 0 ||
      result.sourceHash !== request.sourceHash ||
      result.targetLanguage !== request.targetLanguage ||
      result.promptVersion !== request.promptVersion
    ) {
      throw new ReadmeTranslationError("invalid-response");
    }
    return result as TranslateReadmeResponse;
  };
}

export const translateReadme = createReadmeTranslationProvider();
