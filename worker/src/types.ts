export const TARGET_LANGUAGE = "zh-CN" as const;
export const PROMPT_VERSION = "readme-translate-v1" as const;
export const MAX_README_BYTES = 32_000;
export const MAX_REQUEST_BYTES = 40_960;
export const PROVIDER_TIMEOUT_MS = 45_000;

export interface TranslateReadmeRequest {
  content: string;
  sourceHash: string;
  targetLanguage: typeof TARGET_LANGUAGE;
  promptVersion: typeof PROMPT_VERSION;
}

export interface TranslationProvider {
  readonly name: string;
  translateReadme(
    request: TranslateReadmeRequest,
    signal: AbortSignal,
  ): Promise<string>;
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface WorkerEnv {
  MODEL_API_KEY: string;
  MODEL_API_URL: string;
  MODEL_NAME: string;
  ALLOWED_ORIGINS: string;
  TRANSLATION_RATE_LIMITER?: RateLimitBinding;
}

export interface LogSink {
  info(message: string): void;
}
