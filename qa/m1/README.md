# M1 synthetic acceptance

Run from the SkillHub repository root on Windows with Node 22.18+ and Microsoft Edge. See the [frozen fixture expectations](expected.md) before comparing results.

```powershell
node --test tests/inventory-e2e.test.ts
pnpm run build:web
node qa/m1/edge.mjs --synthetic
node qa/m1/edge.mjs
```

The Node suite runs the normal scanner entry against a new 200-installation tree and for an independently authored V1 example. It compares the source file list and content hashes before and after successful and rejected exports. Run `node qa/m1/fixture.ts` to generate another synthetic directory and manifest for manual inspection. That standalone command prints the disposable manifest path.

The Edge script serves the production build on localhost under `/SkillHubs/`, the Pages project path, and launches a fresh temporary browser profile. It checks direct navigation to `/SkillHubs/#/inventory`, dashboard navigation, and reload. It selects actual fixture files through the Edge DevTools file chooser, exercises the route with keyboard input, and compares network events and browser storage before and after import, review and clear. It measures three scanner processes from launch through successful return and three browser imports from the file input change through the overview's first rendered frame. A run that uses the small example only can be selected with `--synthetic`. Pass `--screenshots <directory>` to save screenshot evidence.

Run the configured-build variant from a separate PowerShell session with a reserved fake translation endpoint:

```powershell
$env:VITE_TRANSLATION_API_URL = 'https://translation.example.invalid'
node node_modules/vite/bin/vite.js build --outDir dist-ssr/m1-translation-configured
node qa/m1/edge.mjs --build dist-ssr/m1-translation-configured --translation
```

The configured build makes the translation control available on a Catalog detail. Inventory operations are observed without opening that control. For the manual-directory regression on the Catalog dashboard, Edge uses the Web directory-input fallback so the test can select the checked-in fixture without a visible operating system dialog.

The browser runner requires local connections to Vite and Edge DevTools. If a managed shell blocks localhost with `EACCES`, run the same local test command from an ordinary terminal. All scanner runs inject a synthetic user profile. No installed Skills from the real user profile are read.
