# Code signing policy

Last updated: 2026-07-30

This policy describes how SkillHub release artifacts are built, approved, signed, verified, and published.

## Signing provider

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

The SignPath Foundation certificate is used for Windows Authenticode publisher identity. Tauri updater signatures use a separate project-controlled Ed25519 key pair embedded in the application.

## Maintainer roles

- Author and committer: [yyr-465](https://github.com/yyr-465)
- Reviewer: [yyr-465](https://github.com/yyr-465)
- Signing-request approver: [yyr-465](https://github.com/yyr-465)

External contributions require maintainer review before merge. Production signing requests require an explicit release approval.

## Privacy

The [Privacy Policy](PRIVACY.md) documents local data storage and every current network interaction, including optional DeepSeek categorization, GitHub-hosted updates, and remote skill icons.

## Source and build provenance

- Canonical source repository: <https://github.com/yyr-465/SkillHubs>
- Production artifacts are built from a tagged commit by GitHub Actions.
- Production signing must run only in the protected release workflow.
- Local QA builds use a distinct product name and application identifier, remain unsigned, and do not generate production updater metadata.
- Production workflows use a frozen package-manager lock file and fail when required signing inputs are unavailable.

## Release artifact requirements

A production Windows x64 release must contain:

- an NSIS installer
- an MSI installer
- final Tauri updater `.sig` files
- `latest.json`
- `SHA256SUMS.txt`
- release notes

The version must match in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.

## Signature order

Windows Authenticode and Tauri updater signatures protect different trust boundaries.

1. Build the Windows installers.
2. Apply Authenticode with SHA-256 and an RFC3161 trusted timestamp.
3. Verify every installer with `Get-AuthenticodeSignature`; every status must be `Valid`.
4. Regenerate the Tauri updater signatures from the final Authenticode-signed installer bytes.
5. Update and validate `latest.json` against the final files and signatures.
6. Generate SHA-256 hashes from the final artifact set.
7. Publish only after every verification succeeds.

The release workflow must stop without publishing a formal release if building, signing, verification, metadata generation, hashing, or upload fails.

## Updater key continuity

Existing clients trust the updater public key embedded in their installed application. That key must not be replaced directly.

If updater-key migration is required:

1. Publish a bridge release whose updater artifacts are signed by the old private key.
2. Embed the replacement public key in the bridge application.
3. Verify old clients can install and launch the bridge release.
4. Maintain the bridge update path for an announced migration period.
5. Sign later releases with the replacement private key only after bridge adoption is verified.

Private keys, passwords, certificates, API tokens, and secret values must never be committed, printed, uploaded as ordinary artifacts, or included in project documentation.

## Verification

Release verification includes:

```powershell
Get-AuthenticodeSignature "<installer-path>"
Get-FileHash "<installer-path>" -Algorithm SHA256
```

The release gate also requires:

- updater signature acceptance for a legitimate update
- rejection of a modified or mismatched signature
- successful installation and upgrade on a clean Windows x64 VM
- old-version recovery after a failed update
- preservation of user data across the upgrade

Verification evidence must not include credentials or sensitive local paths.

## Incident response

If a signing credential is suspected to be compromised:

- stop production releases immediately
- preserve existing public-key configuration
- disable or restrict the affected signing workflow
- notify the signing provider when Authenticode certificate revocation might be required
- document and approve a recovery or bridge-migration plan before publishing another update

Security reports must not disclose credentials or exploit details in a public GitHub issue.
