# Security Policy

SkillHub takes the security of user data and skill execution seriously.

## Supported versions

SkillHub is pre-1.0 software. Only the latest published release receives
security fixes. Installers on the [Releases](https://github.com/yyr-465/SkillHubs/releases)
page are updater-signed but are not yet Authenticode-signed; treat them as test
builds until the production code-signing gate is complete (see
[Code signing policy](CODE_SIGNING_POLICY.md)).

## Reporting a vulnerability

**Do not open a public issue for a suspected security vulnerability.** Public
issues are visible to everyone and can leak exploit details.

To report a suspected vulnerability:

1. Open a minimal issue that says only "I would like to report a potential
   security vulnerability" and request a private contact channel.
2. The maintainer will reply with a private way to share details.
3. Include, when available: the SkillHub version, the affected area (for
   example scanning, execution, import/export, backup, or the Web edition), and
   a minimal reproduction. Do not include API keys, tokens, private keys,
   personal files, or local machine paths.

We aim to acknowledge reports within a few business days and to confirm a
fix or a reasoned disposition for every report.

## Security principles in SkillHub

- **Execution is opt-in and narrow.** Commands are never inferred from Markdown
  code blocks. A skill must declare an explicit execution section, and the user
  must review and confirm it. Commands run without a shell under a narrow
  executable allowlist with timeouts, capped output, an audit record, and
  Windows process-tree cleanup. See [Safe execution](docs/safe-execution.md).
- **No secrets in backups.** Backups never include API keys, tokens, or private
  keys; restore preserves the current machine's API key.
- **Least-privilege file access.** The frontend file-system plugin can only
  reach desktop, document, and download folders by default; the user explicitly
  grants other folders through the file dialogs.
- **Local-first data.** Catalog data, settings, history, and audit records stay
  on the user's machine. Network access happens only for user-initiated AI
  categorization, update checks/downloads, and remote skill icon URLs. See the
  [Privacy Policy](PRIVACY.md).
- **No secrets in the repository.** Never commit API keys, tokens, private
  keys, or local machine paths (see [CONTRIBUTING](CONTRIBUTING.md)).
