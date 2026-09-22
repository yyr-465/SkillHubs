import {
  MAX_README_BYTES,
  PROMPT_VERSION,
  TARGET_LANGUAGE,
  type TranslateReadmeRequest,
} from "./types.ts";

const SHA256_HEX = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();

export class RequestValidationError extends Error {
  readonly code: "INVALID_REQUEST" | "README_TOO_LARGE";
  readonly status: 400 | 413;

  constructor(code: "INVALID_REQUEST" | "README_TOO_LARGE") {
    super(code);
    this.name = "RequestValidationError";
    this.code = code;
    this.status = code === "README_TOO_LARGE" ? 413 : 400;
  }
}

export function normalizeReadmeForHash(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}

export async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(normalizeReadmeForHash(content)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function validateTranslationRequest(
  input: unknown,
): Promise<TranslateReadmeRequest> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new RequestValidationError("INVALID_REQUEST");
  }

  const candidate = input as Record<string, unknown>;
  if (
    typeof candidate.content !== "string" ||
    candidate.content.trim().length === 0 ||
    typeof candidate.sourceHash !== "string" ||
    !SHA256_HEX.test(candidate.sourceHash) ||
    candidate.targetLanguage !== TARGET_LANGUAGE ||
    candidate.promptVersion !== PROMPT_VERSION
  ) {
    throw new RequestValidationError("INVALID_REQUEST");
  }

  if (encoder.encode(candidate.content).byteLength > MAX_README_BYTES) {
    throw new RequestValidationError("README_TOO_LARGE");
  }

  if ((await sha256Hex(candidate.content)) !== candidate.sourceHash) {
    throw new RequestValidationError("INVALID_REQUEST");
  }

  return {
    content: candidate.content,
    sourceHash: candidate.sourceHash,
    targetLanguage: TARGET_LANGUAGE,
    promptVersion: PROMPT_VERSION,
  };
}
