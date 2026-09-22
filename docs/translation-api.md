# README Translation API Contract

The SkillHub Web client never calls an LLM provider directly. It sends only the
currently selected README to a separately deployed HTTPS translation service.
Provider credentials must exist only in that service's server-side environment.

## Configuration

Set `VITE_TRANSLATION_API_URL` to the public HTTPS endpoint URL at build time.
This value is an endpoint, not a credential. Production builds reject non-HTTPS
endpoints. Local development may use `http://localhost`. The Web CSP adds only
the validated configured origin to `connect-src`; without configuration it
remains limited to the site origin.

When no endpoint is configured, Original README viewing remains available and
the UI reports that translation is not configured. There is no production mock
or browser-side provider fallback.

## Request

`POST /api/translate-readme` (or the configured full endpoint)

```json
{
  "content": "# Original Markdown",
  "sourceHash": "sha256-hex",
  "targetLanguage": "zh-CN",
  "promptVersion": "readme-translate-v1"
}
```

Headers:

```text
Content-Type: application/json
Accept: application/json
```

The browser sends no provider API key. The Worker permits only the configured
SkillHub production and local-development origins. It applies its Cloudflare
rate-limit binding before reading the README or calling the provider.
The Web client aborts a translation request after 60 seconds.

The Worker accepts at most 40,960 bytes for the full JSON request and 32,000
UTF-8 bytes for `content`. It never truncates a README. It normalizes CRLF to LF,
trims the README, recomputes its SHA-256 hash, and rejects a mismatched hash.

## Success response

```json
{
  "content": "# 中文 Markdown",
  "sourceHash": "sha256-hex",
  "targetLanguage": "zh-CN",
  "promptVersion": "readme-translate-v1"
}
```

The client rejects empty content or any response whose hash, language, or prompt
version differs from the request.

## Error response

The Worker returns a small JSON error and never exposes a provider response,
request header, stack trace, or secret. Defined errors are:

| Status | Error |
| --- | --- |
| 400 | `INVALID_REQUEST` |
| 413 | `README_TOO_LARGE` |
| 429 | `RATE_LIMITED` |
| 502 | `TRANSLATION_PROVIDER_ERROR` |
| 503 | `SERVICE_MISCONFIGURED` |
| 504 | `TRANSLATION_TIMEOUT` |

```json
{
  "error": "RATE_LIMITED",
  "message": "Too many translation requests."
}
```

## Server-owned semantic translation prompt

The service must version the following behavior as `readme-translate-v1`:

- Understand the README's context before translating it into natural,
  technically accurate Simplified Chinese for Chinese developers.
- Preserve meaning; do not summarize, omit, or add information.
- Preserve Markdown headings, lists, tables, blockquotes, links, and images.
- Do not translate or modify fenced code, shell commands, code, variables,
  paths, URLs, CLI arguments, package names, library names, model names, or API
  names.
- Use standard software-development and AI terminology. Keep Skill, Agent,
  Prompt, and API in English when that is the natural developer convention.
- Self-check completeness, terminology, technical meaning, protected content,
  Markdown validity, and Chinese fluency before returning one final Markdown
  document.
- Return only the complete translated Markdown.

The quality check belongs inside the same model request. The browser must not
make a second LLM request for review.

## Worker deployment contract

The implementation lives under `worker/`. It uses an OpenAI-compatible
chat-completions provider behind the `TranslationProvider` interface.

- `MODEL_API_KEY`: Cloudflare Worker secret.
- `MODEL_API_URL`: non-secret Worker variable containing an HTTPS endpoint.
- `MODEL_NAME`: non-secret Worker variable.
- `ALLOWED_ORIGINS`: comma-separated exact origins.
- `TRANSLATION_RATE_LIMITER`: required Cloudflare Rate Limiting binding,
  configured for five requests per IP per 60 seconds.

The provider timeout is 45 seconds, shorter than the browser's 60-second
timeout. Logs contain only request ID, the first 12 hash characters, content
byte count, duration, status, provider name, and model name. They never contain
README text, IP addresses, local paths, credentials, or raw provider errors.

See `worker/README.md` for local development and deployment configuration.
