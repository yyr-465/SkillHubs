import {
  createOpenAiCompatibleProvider,
  ProviderConfigurationError,
} from "./providers/openAiCompatible.ts";
import {
  MAX_REQUEST_BYTES,
  PROVIDER_TIMEOUT_MS,
  type LogSink,
  type TranslationProvider,
  type WorkerEnv,
} from "./types.ts";
import {
  RequestValidationError,
  validateTranslationRequest,
} from "./validation.ts";

type ErrorCode =
  | "INVALID_REQUEST"
  | "README_TOO_LARGE"
  | "RATE_LIMITED"
  | "TRANSLATION_PROVIDER_ERROR"
  | "TRANSLATION_TIMEOUT"
  | "SERVICE_MISCONFIGURED";

interface HandlerDependencies {
  provider?: TranslationProvider;
  providerTimeoutMs?: number;
  logger?: LogSink;
  now?: () => number;
  randomUuid?: () => string;
}

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_REQUEST: "The translation request is invalid.",
  README_TOO_LARGE: "The README exceeds the translation size limit.",
  RATE_LIMITED: "Too many translation requests.",
  TRANSLATION_PROVIDER_ERROR: "The translation provider could not complete the request.",
  TRANSLATION_TIMEOUT: "The translation request timed out.",
  SERVICE_MISCONFIGURED: "The translation service is unavailable.",
};

class RequestBodyTooLargeError extends Error {}
class ProviderTimeoutError extends Error {}

export function createHandler(dependencies: HandlerDependencies = {}) {
  return async (request: Request, env: WorkerEnv): Promise<Response> => {
    const now = dependencies.now ?? Date.now;
    const startedAt = now();
    const requestId = dependencies.randomUuid?.() ?? crypto.randomUUID();
    const origin = request.headers.get("Origin");
    const allowedOrigin = resolveAllowedOrigin(origin, env.ALLOWED_ORIGINS);
    let status = 500;
    let sourceHash = "";
    let contentBytes = 0;
    let providerName = dependencies.provider?.name ?? "openai-compatible";

    const respond = (body: unknown, responseStatus: number): Response => {
      status = responseStatus;
      return jsonResponse(body, responseStatus, allowedOrigin, requestId);
    };

    try {
      const url = new URL(request.url);
      if (url.pathname !== "/api/translate-readme") {
        status = 404;
        return new Response("Not found.", { status });
      }
      if (!allowedOrigin) {
        return respond(
          { error: "INVALID_REQUEST", message: "Origin is not allowed." },
          403,
        );
      }
      if (request.method === "OPTIONS") {
        status = 204;
        return new Response(null, {
          status,
          headers: corsHeaders(allowedOrigin, requestId),
        });
      }
      if (request.method !== "POST") {
        status = 405;
        return new Response("Method not allowed.", {
          status,
          headers: { ...corsHeaders(allowedOrigin, requestId), Allow: "POST, OPTIONS" },
        });
      }
      if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
        return respond(errorBody("INVALID_REQUEST"), 400);
      }
      if (!env.TRANSLATION_RATE_LIMITER) {
        return respond(errorBody("SERVICE_MISCONFIGURED"), 503);
      }

      const clientKey = request.headers.get("CF-Connecting-IP") ?? "unknown";
      const rateLimit = await env.TRANSLATION_RATE_LIMITER.limit({ key: clientKey });
      if (!rateLimit.success) {
        return respond(errorBody("RATE_LIMITED"), 429);
      }

      const rawBody = await readRequestBody(request, MAX_REQUEST_BYTES);
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return respond(errorBody("INVALID_REQUEST"), 400);
      }
      const validated = await validateTranslationRequest(parsed);
      sourceHash = validated.sourceHash;
      contentBytes = new TextEncoder().encode(validated.content).byteLength;

      let provider = dependencies.provider;
      if (!provider) {
        provider = createOpenAiCompatibleProvider({
          apiKey: env.MODEL_API_KEY,
          apiUrl: env.MODEL_API_URL,
          model: env.MODEL_NAME,
        });
      }
      providerName = provider.name;
      const translatedContent = await translateWithTimeout(
        provider,
        validated,
        dependencies.providerTimeoutMs ?? PROVIDER_TIMEOUT_MS,
      );
      if (!translatedContent.trim()) {
        return respond(errorBody("TRANSLATION_PROVIDER_ERROR"), 502);
      }
      return respond(
        {
          content: translatedContent,
          sourceHash: validated.sourceHash,
          targetLanguage: validated.targetLanguage,
          promptVersion: validated.promptVersion,
        },
        200,
      );
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return respond(
          { error: "README_TOO_LARGE", message: ERROR_MESSAGES.README_TOO_LARGE },
          413,
        );
      }
      if (error instanceof RequestValidationError) {
        return respond(
          { error: error.code, message: ERROR_MESSAGES[error.code] },
          error.status,
        );
      }
      if (error instanceof ProviderTimeoutError) {
        return respond(
          { error: "TRANSLATION_TIMEOUT", message: ERROR_MESSAGES.TRANSLATION_TIMEOUT },
          504,
        );
      }
      if (error instanceof ProviderConfigurationError) {
        return respond(
          { error: "SERVICE_MISCONFIGURED", message: ERROR_MESSAGES.SERVICE_MISCONFIGURED },
          503,
        );
      }
      return respond(
        {
          error: "TRANSLATION_PROVIDER_ERROR",
          message: ERROR_MESSAGES.TRANSLATION_PROVIDER_ERROR,
        },
        502,
      );
    } finally {
      const logger = dependencies.logger ?? console;
      logger.info(
        JSON.stringify({
          event: "translate_readme",
          requestId,
          sourceHashPrefix: sourceHash.slice(0, 12),
          contentBytes,
          durationMs: Math.max(0, now() - startedAt),
          status,
          provider: providerName,
          model: env.MODEL_NAME || "unconfigured",
        }),
      );
    }
  };
}

async function readRequestBody(request: Request, limit: number): Promise<string> {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(combined);
}

async function translateWithTimeout(
  provider: TranslationProvider,
  request: Parameters<TranslationProvider["translateReadme"]>[0],
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new ProviderTimeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      provider.translateReadme(request, controller.signal),
      timeout,
    ]);
  } catch (error) {
    if (controller.signal.aborted) throw new ProviderTimeoutError();
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function resolveAllowedOrigin(origin: string | null, configured: string): string | null {
  if (!origin) return null;
  const allowed = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(origin: string, requestId: string): Record<string, string> {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId,
    Vary: "Origin",
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  requestId: string,
): Response {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": requestId,
  };
  if (origin) Object.assign(headers, corsHeaders(origin, requestId));
  return Response.json(body, { status, headers });
}

function errorBody(code: ErrorCode): { error: ErrorCode; message: string } {
  return { error: code, message: ERROR_MESSAGES[code] };
}
