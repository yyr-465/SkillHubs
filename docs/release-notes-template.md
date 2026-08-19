# Release notes template

Use this template for every published GitHub Release. Delete or keep the
placeholder comments as appropriate. The release workflow generates the
updater artifacts and checksums; fill in the human-readable sections below.

---

## SkillHub vX.Y.Z

**Release date:** YYYY-MM-DD

### Highlights

- One or two sentences about the most important changes in this release.

### Features

- ...

### Fixes

- ...

### Known limitations

- Point to [Known limitations](known-limitations.md) and call out anything new
  in this release.

### Upgrade requirements

- Current data migrates automatically on first launch.
- If upgrading from a version older than v0.1.x, ... (fill in as needed).
- Existing backups remain compatible (backup format version 1).

### Release assets

- NSIS installer: `SkillHub-X.Y.Z-setup.exe`
- MSI installer: `SkillHub-X.Y.Z-x64.msi`
- Update manifest: `latest.json`
- Checksums: `SHA256SUMS.txt`

### Signing status

- Updater signature: verified against the published public key.
- Authenticode: (Valid / Not signed yet — see code signing policy)
- Verify with:

```powershell
Get-AuthenticodeSignature "<installer-path>"
Get-FileHash "<installer-path>" -Algorithm SHA256
```
