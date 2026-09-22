import assert from "node:assert/strict";
import test from "node:test";

import { createHandler } from "../src/handler.ts";
import { createOpenAiCompatibleProvider } from "../src/providers/openAiCompatible.ts";
import {
  MAX_README_BYTES,
  PROMPT_VERSION,
  TARGET_LANGUAGE,
  type TranslateReadmeRequest,
  type TranslationProvider,
  type WorkerEnv,
} from "../src/types.ts";
import { sha256Hex } from "../src/validation.ts";

const ENDPOINT = "https://worker.example/api/translate-readme";
const ORIGIN = "https://yyr-465.github.io";

function env(rateLimitSuccess = true): WorkerEnv {
  return {
    MODEL_API_KEY: "test-only",
    MODEL_API_URL: "https://provider.example/chat/completions",
    MODEL_NAME: "test-model",
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:1420,http://127.0.0.1:1420`,
    TRANSLATION_RATE_LIMITER: {
      async limit() {
        return { success: rateLimitSuccess };
      },
    },
  };
}

async function payload(content = "# Hello"): Promise<TranslateReadmeRequest> {
  return {
    content,
    sourceHash: await sha256Hex(content),
    targetLanguage: TARGET_LANGUAGE,
    promptVersion: PROMPT_VERSION,
  };
}

function request(body: unknown, origin = ORIGIN): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      "CF-Connecting-IP": "203.0.113.10",
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

function mockProvider(
  implementation: TranslationProvider["translateReadme"] = async () => "# 你好",
): TranslationProvider {
  return { name: "mock", translateReadme: implementation };
}

function quietLogger() {
  return { info() {} };
}

test("translates a normal README and returns contract fields unchanged", async () => {
  const input = await payload();
  let received: TranslateReadmeRequest | undefined;
  const handler = createHandler({
    provider: mockProvider(async (value) => {
      received = value;
      return "# 你好";
    }),
    logger: quietLogger(),
  });
  const response = await handler(request(input), env());

  assert.equal(response.status, 200);
  assert.deepEqual(received, input);
  assert.deepEqual(await response.json(), {
    content: "# 你好",
    sourceHash: input.sourceHash,
    targetLanguage: "zh-CN",
    promptVersion: "readme-translate-v1",
  });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal(response.headers.get("Vary"), "Origin");
});

for (const [name, change] of [
  ["empty content", { content: "" }],
  ["invalid hash", { sourceHash: "not-a-hash" }],
  ["mismatched hash", { sourceHash: "0".repeat(64) }],
  ["invalid target language", { targetLanguage: "en" }],
  ["invalid prompt version", { promptVersion: "readme-translate-v2" }],
] as const) {
  test(`rejects ${name}`, async () => {
    const input = { ...(await payload()), ...change };
    const handler = createHandler({ provider: mockProvider(), logger: quietLogger() });
    const response = await handler(request(input), env());
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { error: string }).error, "INVALID_REQUEST");
  });
}

test("rejects an oversized README without truncating or calling the provider", async () => {
  const content = "a".repeat(MAX_README_BYTES + 1);
  let providerCalled = false;
  const handler = createHandler({
    provider: mockProvider(async () => {
      providerCalled = true;
      return "unexpected";
    }),
    logger: quietLogger(),
  });
  const response = await handler(request(await payload(content)), env());
  assert.equal(response.status, 413);
  assert.equal((await response.json() as { error: string }).error, "README_TOO_LARGE");
  assert.equal(providerCalled, false);
});

test("handles an allowed OPTIONS preflight", async () => {
  const handler = createHandler({ logger: quietLogger() });
  const response = await handler(
    new Request(ENDPOINT, { method: "OPTIONS", headers: { Origin: "http://localhost:1420" } }),
    env(),
  );
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "http://localhost:1420");
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
});

test("rejects an origin outside the allowlist without CORS access", async () => {
  const handler = createHandler({ provider: mockProvider(), logger: quietLogger() });
  const response = await handler(request(await payload(), "https://evil.example"), env());
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("rejects a POST without an application/json content type", async () => {
  const input = await payload();
  const handler = createHandler({ provider: mockProvider(), logger: quietLogger() });
  const response = await handler(
    new Request(ENDPOINT, {
      method: "POST",
      headers: { Origin: ORIGIN },
      body: JSON.stringify(input),
    }),
    env(),
  );
  assert.equal(response.status, 400);
});

test("returns 429 before calling the provider when the IP limit is exceeded", async () => {
  let providerCalled = false;
  const handler = createHandler({
    provider: mockProvider(async () => {
      providerCalled = true;
      return "unexpected";
    }),
    logger: quietLogger(),
  });
  const response = await handler(request(await payload()), env(false));
  assert.equal(response.status, 429);
  assert.equal((await response.json() as { error: string }).error, "RATE_LIMITED");
  assert.equal(providerCalled, false);
});

test("fails closed when the rate-limit binding is absent", async () => {
  const testEnv = env();
  delete testEnv.TRANSLATION_RATE_LIMITER;
  const handler = createHandler({ provider: mockProvider(), logger: quietLogger() });
  const response = await handler(request(await payload()), testEnv);
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { error: string }).error, "SERVICE_MISCONFIGURED");
});

test("returns a sanitized timeout error", async () => {
  const handler = createHandler({
    provider: mockProvider(() => new Promise(() => {})),
    providerTimeoutMs: 5,
    logger: quietLogger(),
  });
  const response = await handler(request(await payload()), env());
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), {
    error: "TRANSLATION_TIMEOUT",
    message: "The translation request timed out.",
  });
});

test("returns a sanitized provider error", async () => {
  const handler = createHandler({
    provider: mockProvider(async () => {
      throw new Error("secret upstream response");
    }),
    logger: quietLogger(),
  });
  const response = await handler(request(await payload()), env());
  assert.equal(response.status, 502);
  const body = JSON.stringify(await response.json());
  assert.match(body, /TRANSLATION_PROVIDER_ERROR/);
  assert.doesNotMatch(body, /secret upstream response/);
});

test("logs metadata without README text, IP address, or provider errors", async () => {
  const logLines: string[] = [];
  const input = await payload("PRIVATE README CONTENT");
  const handler = createHandler({
    provider: mockProvider(async () => {
      throw new Error("PRIVATE PROVIDER ERROR");
    }),
    logger: { info(line) { logLines.push(line); } },
    randomUuid: () => "request-id",
    now: (() => {
      let value = 100;
      return () => value++;
    })(),
  });
  await handler(request(input), env());

  assert.equal(logLines.length, 1);
  assert.match(logLines[0], /"requestId":"request-id"/);
  assert.match(logLines[0], new RegExp(input.sourceHash.slice(0, 12)));
  assert.doesNotMatch(logLines[0], /PRIVATE README CONTENT/);
  assert.doesNotMatch(logLines[0], /PRIVATE PROVIDER ERROR/);
  assert.doesNotMatch(logLines[0], /203\.0\.113\.10/);
});

test("passes Markdown code, URL, shell command, table, and link through intact", async () => {
  const markdown = [
    "# Install",
    "",
    "```ts",
    "const url = \"https://example.com/api\";",
    "```",
    "",
    "`pnpm add skillhub --frozen-lockfile`",
    "",
    "| Name | URL |",
    "| --- | --- |",
    "| Docs | https://example.com/docs |",
    "",
    "[Open docs](https://example.com/docs)",
  ].join("\n");
  const translated = markdown.replace("# Install", "# 安装").replace("| Name | URL |", "| 名称 | URL |");
  const handler = createHandler({
    provider: mockProvider(async (value) => {
      assert.equal(value.content, markdown);
      return translated;
    }),
    logger: quietLogger(),
  });
  const response = await handler(request(await payload(markdown)), env());
  assert.equal(response.status, 200);
  const output = (await response.json() as { content: string }).content;
  assert.match(output, /const url = "https:\/\/example\.com\/api";/);
  assert.match(output, /pnpm add skillhub --frozen-lockfile/);
  assert.match(output, /\| Docs \| https:\/\/example\.com\/docs \|/);
  assert.match(output, /\[Open docs\]\(https:\/\/example\.com\/docs\)/);
});

test("rejects an empty provider result", async () => {
  const handler = createHandler({ provider: mockProvider(async () => "  "), logger: quietLogger() });
  const response = await handler(request(await payload()), env());
  assert.equal(response.status, 502);
});

for (const [name, upstreamBody] of [
  ["empty model string", { choices: [{ message: { content: "" } }] }],
  ["unexpected model structure", { output: "# 你好" }],
] as const) {
  test(`OpenAI-compatible provider rejects ${name}`, async () => {
    const provider = createOpenAiCompatibleProvider({
      apiKey: "test-only",
      apiUrl: "https://provider.example/chat/completions",
      model: "test-model",
      fetchImpl: async () => Response.json(upstreamBody),
    });
    await assert.rejects(provider.translateReadme(await payload(), new AbortController().signal));
  });
}

test("OpenAI-compatible provider uses one request and keeps protected README text", async () => {
  const input = await payload("Run `pnpm test` and visit https://example.com.");
  let calls = 0;
  const provider = createOpenAiCompatibleProvider({
    apiKey: "test-only",
    apiUrl: "https://provider.example/chat/completions",
    model: "test-model",
    fetchImpl: async (_url, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      assert.match(body.messages[1].content, /`pnpm test`/);
      assert.match(body.messages[1].content, /https:\/\/example\.com/);
      return Response.json({ choices: [{ message: { content: "运行 `pnpm test` 并访问 https://example.com。" } }] });
    },
  });
  const output = await provider.translateReadme(input, new AbortController().signal);
  assert.equal(calls, 1);
  assert.equal(output, "运行 `pnpm test` 并访问 https://example.com。");
});
