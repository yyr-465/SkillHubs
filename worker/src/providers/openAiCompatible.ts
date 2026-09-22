import {
  buildTranslationUserPrompt,
  TRANSLATION_SYSTEM_PROMPT,
} from "../prompt.ts";
import type {
  TranslateReadmeRequest,
  TranslationProvider,
} from "../types.ts";

export class ProviderConfigurationError extends Error {}
export class ProviderResponseError extends Error {}

interface OpenAiCompatibleProviderOptions {
  apiKey: string;
  apiUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export function createOpenAiCompatibleProvider(
  options: OpenAiCompatibleProviderOptions,
): TranslationProvider {
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  let apiUrl: URL;
  try {
    apiUrl = new URL(options.apiUrl);
  } catch {
    throw new ProviderConfigurationError();
  }
  if (!apiKey || !model || apiUrl.protocol !== "https:") {
    throw new ProviderConfigurationError();
  }
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    name: "openai-compatible",
    async translateReadme(
      request: TranslateReadmeRequest,
      signal: AbortSignal,
    ): Promise<string> {
      let response: Response;
      try {
        response = await fetchImpl(apiUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 16_000,
            messages: [
              { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
              { role: "user", content: buildTranslationUserPrompt(request) },
            ],
          }),
          signal,
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new ProviderResponseError();
      }
      if (!response.ok) throw new ProviderResponseError();

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new ProviderResponseError();
      }
      const content = extractMessageContent(data);
      if (!content.trim()) throw new ProviderResponseError();
      return content;
    },
  };
}

function extractMessageContent(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    throw new ProviderResponseError();
  }
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new ProviderResponseError();
  }
  const first = choices[0];
  if (typeof first !== "object" || first === null) {
    throw new ProviderResponseError();
  }
  const message = (first as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) {
    throw new ProviderResponseError();
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string") throw new ProviderResponseError();
  return content;
}
