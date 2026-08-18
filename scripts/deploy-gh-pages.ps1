# Publishes the built dist/ to the gh-pages branch (GitHub Pages).
# Run from YOUR OWN PowerShell (where git is authenticated):
#   cd <your SkillHub checkout>
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-gh-pages.ps1
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot   # SkillHub/
Set-Location $root

if (-not (Test-Path "dist/index.html")) {
    Write-Host "dist/index.html missing. Building first..."
    pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed." }
}

$remote = "https://github.com/yyr-465/SkillHubs.git"
$tmp = Join-Path $env:TEMP ("skillhub-gh-pages-" + $PID)
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $tmp | Out-Null

Copy-Item -Recurse -Force "dist/*" $tmp

Push-Location $tmp
git init -q
git config user.name "SkillHub Deploy"
git config user.email "deploy@skillhub.local"
# This machine's schannel TLS is broken (SEC_E_NO_CREDENTIALS -> connection reset);
# use the OpenSSL backend, which connects to GitHub fine.
git config http.sslBackend openssl
git checkout -q -b gh-pages
git add -A
git commit -q -m "Deploy SkillHub Web to GitHub Pages"
git remote add origin $remote
Write-Host "Pushing to GitHub (if prompted, use your GitHub username and a Personal Access Token, not your password)..."
git push -u origin gh-pages --force
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    throw "git push FAILED (exit $LASTEXITCODE). Fix the error above, then re-run this script."
}
Pop-Location

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "SUCCESS: pushed to the gh-pages branch. Now enable Pages ONCE:"
Write-Host "  https://github.com/yyr-465/SkillHubs/settings/pages"
Write-Host "  Source: Deploy from a branch -> gh-pages, / (root) -> Save"
Write-Host "Site URL: https://yyr-465.github.io/SkillHubs/"
