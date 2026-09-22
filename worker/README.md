# SkillHub README Translation Worker

This Cloudflare Worker exposes `POST /api/translate-readme` for the SkillHub Web
client. It validates and hashes the README, applies a per-IP Cloudflare rate
limit, and sends one request to an OpenAI-compatible chat-completions API.
README content is limited to 32,000 UTF-8 bytes and is never truncated. The
provider request allows at most 16,000 output tokens and times out after 45
seconds.

## Local development

1. Copy `.dev.vars.example` to `.dev.vars` and fill the values locally. Never
   commit `.dev.vars`.
2. Set `MODEL_API_URL` to the provider's chat-completions endpoint and
   `MODEL_NAME` to its model identifier.
3. Run `pnpm worker:dev` from the repository root.
4. Set the Web development environment variable to
   `VITE_TRANSLATION_API_URL=http://localhost:8787/api/translate-readme` and run
   `pnpm dev`.

The local Worker still calls the configured provider. Automated tests use mocks
and never make paid model requests.

## Cloudflare configuration

- Store the provider credential with
  `node node_modules/wrangler/bin/wrangler.js secret put MODEL_API_KEY --config worker/wrangler.toml`.
- Set `MODEL_API_URL`, `MODEL_NAME`, and `ALLOWED_ORIGINS` as non-secret Worker
  variables. The committed production allowlist contains the SkillHub GitHub
  Pages origin and the two local Vite origins.
- Keep the `TRANSLATION_RATE_LIMITER` binding. It permits five requests per IP
  in each 60-second period. The handler returns `503` when the binding is
  missing instead of calling the provider without rate limiting.
- Set the GitHub Pages build variable `VITE_TRANSLATION_API_URL` to the final
  HTTPS Worker endpoint. It is an address only and must never contain a key.

Validate with `pnpm test:worker` and `pnpm typecheck:worker`. Deployment is a
separate manual step with `pnpm worker:deploy`; do not deploy before setting the
model, secret, final origin allowlist, and reviewing the Cloudflare rate-limit
configuration.
