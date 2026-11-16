import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { flushSync } from "react-dom";
import { Files, FolderSearch, Upload } from "lucide-react";
import { useTranslation } from "@/i18n";
import { analyzeInventory, filterInstallations, readInventory, type InventoryImportError } from "@/lib/inventory";
import type {
  InventoryInstallation,
  InventoryManifest,
} from "../../../shared/inventory/manifest.ts";

const PAGE_SIZE = 50;
const surface = "min-w-0 rounded-lg border border-border bg-card p-3 @sm:p-4";
const muted = "text-sm leading-relaxed text-muted-foreground";
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const button = "inline-flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 " + focus;
const secondary = button + " border border-border bg-background hover:bg-accent";
const field = "min-w-0 w-full rounded-md border border-border bg-background px-2 py-2 text-sm " + focus;
const wrap = "[overflow-wrap:anywhere]";

export default function Inventory() {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const request = useRef({ revision: 0 });
  const [snapshot, setSnapshot] = useState<{ manifest: InventoryManifest; revision: number } | null>(null);
  const [error, setError] = useState<InventoryImportError | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    const session = request.current;
    function onPageHide() {
      // Clear before a browser can freeze this document in the back-forward cache.
      session.revision++;
      flushSync(() => {
        setSnapshot(null);
        setError(null);
        setReading(false);
      });
    }
    window.addEventListener("pagehide", onPageHide);
    return () => {
      session.revision++;
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    // A second selection of the same file still needs to fire a change event.
    event.currentTarget.value = "";
    if (!file) return;

    const revision = ++request.current.revision;
    setReading(true);
    setError(null);
    const result = await readInventory(file);
    if (request.current.revision !== revision) return;
    setReading(false);
    if (result.ok) setSnapshot({ manifest: result.manifest, revision });
    else setError(result.error);
  }

  function clear() {
    request.current.revision++;
    setSnapshot(null);
    setError(null);
    setReading(false);
    chooseButton.current?.focus();
  }

  return (
    <div className="@container mx-auto flex min-w-0 max-w-6xl flex-col gap-5">
      <section className={surface + " space-y-3"} aria-labelledby="inventory-title">
        <h1 id="inventory-title" className={"text-2xl font-semibold " + wrap}>{t("inventory.title")}</h1>
        <p className={muted}>{t("inventory.instructions")}</p>
        <code className={"block w-fit max-w-full rounded-md bg-muted px-2 py-1.5 text-xs " + wrap} dir="ltr">
          pnpm run inventory:scan --output skillhub-inventory.json
        </code>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            aria-label={t("inventory.choose")}
            hidden
            onChange={(event) => void selectFile(event)}
          />
          <button
            ref={chooseButton}
            type="button"
            className={button + " bg-primary text-primary-foreground hover:opacity-90 " + wrap}
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden="true" className="size-4 shrink-0" />
            {t("inventory.choose")}
          </button>
          {(snapshot || reading || error) && (
            <button type="button" className={secondary} onClick={clear}>{t("inventory.clear")}</button>
          )}
        </div>
        <p className={muted}>{t("inventory.privacy")}</p>
        <div role="status" className={reading ? muted : "sr-only"}>
          {reading ? t("inventory.reading") : snapshot && !error ? t("inventory.loaded") : null}
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground">
            {t("inventory.error." + error)}
            {snapshot && " " + t("inventory.previousKept")}
          </p>
        )}
      </section>
      {snapshot
        ? <InventoryResults key={snapshot.revision} manifest={snapshot.manifest} />
        : <p className={"rounded-lg border border-dashed border-border p-4 " + muted}>{t("inventory.noManifest")}</p>}
    </div>
  );
}

type SourceLabel = (rootId: string) => string;

function InventoryResults({ manifest }: { manifest: InventoryManifest }) {
  const { t, lang } = useTranslation();
  const analysis = useMemo(() => analyzeInventory(manifest), [manifest]);
  const sources = useMemo(
    () => new Map(manifest.roots.map((root, index) => [root.id, { root, number: index + 1 }])),
    [manifest],
  );
  const [query, setQuery] = useState("");
  const [rootId, setRootId] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<{ id: string } | null>(null);
  const filtered = useMemo(() =>
    filterInstallations(manifest.installations, query, rootId), [manifest, query, rootId]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const first = (page - 1) * PAGE_SIZE;
  const visible = filtered.slice(first, first + PAGE_SIZE);

  function sourceLabel(id: string) {
    const source = sources.get(id);
    return source
      ? "#" + source.number + " · " + t("inventory.kind." + source.root.kind) + " · " + t("inventory.scope." + source.root.scope)
      : id;
  }

  function showInstallation(id: string) {
    const index = manifest.installations.findIndex((installation) => installation.id === id);
    if (index === -1) return;
    setQuery("");
    setRootId("");
    setPage(Math.floor(index / PAGE_SIZE) + 1);
    setTarget({ id });
  }

  useEffect(() => {
    if (!target) return;
    const row = document.getElementById("installation-" + target.id);
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "center" });
  }, [target]);

  const metrics = [
    { label: "installationCount", value: analysis.installationCount },
    { label: "contentCount", value: analysis.contentCount },
    { label: "sourceCount", value: analysis.sourceCount },
  ];
  const scanTime = new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(manifest.generatedAt));

  return (
    <>
      <div className="space-y-2">
        <p className={muted}>
          {t("inventory.scanTime")} <time dateTime={manifest.generatedAt}>{scanTime}</time>
        </p>
        <dl id="inventory-summary" className="grid gap-2 @md:grid-cols-3" aria-label={t("inventory.summary")}>
          {metrics.map(({ label, value }) => (
            <div key={label} className={surface}>
              <dt className={muted}>{t("inventory." + label)}</dt>
              <dd className="text-xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <section id="inventory-coverage" className={surface + " space-y-3"} aria-labelledby="inventory-coverage-heading">
        <h2 id="inventory-coverage-heading" className="flex items-center gap-2 text-lg font-semibold">
          <FolderSearch aria-hidden="true" className="size-4 shrink-0" />
          {t("inventory.coverage")}
        </h2>
        <ul className="grid gap-2 @md:grid-cols-2">
          {manifest.roots.map(({ id, status }) => (
            <li key={id} className="min-w-0 space-y-1 rounded-md border border-border bg-background p-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-sm">
                <span className="font-medium">{sourceLabel(id)}</span>
                <span className={"rounded bg-muted px-2 py-0.5 text-xs " + (status === "scanned" ? "text-foreground" : "font-semibold text-foreground")}>
                  {t("inventory.status." + status)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("inventory.sourceLocations").replace("{count}", String(analysis.countsByRoot.get(id) ?? 0))}
              </p>
              <p className={"text-xs text-muted-foreground " + wrap}>
                {t("inventory.sourceId")} <code dir="ltr">{id}</code>
              </p>
            </li>
          ))}
        </ul>
        <details id="inventory-diagnostics" className="rounded-md border border-border bg-background p-2">
          <summary className={"cursor-pointer rounded text-sm font-medium " + focus}>
            {t("inventory.diagnostics").replace("{count}", String(manifest.diagnostics.length))}
          </summary>
          {manifest.diagnostics.length > 0
            ? <ul className="mt-2 grid gap-2 text-sm">
                {manifest.diagnostics.map(({ code, rootId: diagnosticRoot, relativePath }, index) => (
                  <li key={index} className="border-t border-border pt-2">
                    <p>{sourceLabel(diagnosticRoot)}</p>
                    <p className="text-muted-foreground">{t("inventory.diagnostic." + code)}</p>
                    {relativePath && <code className={wrap} dir="ltr"><bdi>{relativePath}</bdi></code>}
                  </li>
                ))}
              </ul>
            : <p className={"mt-2 " + muted}>{t("inventory.noDiagnostics")}</p>}
        </details>
        {manifest.omittedDiagnostics > 0 && (
          <p className={muted}>{t("inventory.omittedDiagnostics").replace("{count}", String(manifest.omittedDiagnostics))}</p>
        )}
      </section>

      <section id="inventory-evidence" className={surface + " space-y-3"} aria-labelledby="inventory-evidence-heading">
        <h2 id="inventory-evidence-heading" className="flex items-center gap-2 text-lg font-semibold">
          <Files aria-hidden="true" className="size-4 shrink-0" />
          {t("inventory.evidence")}
        </h2>
        {([{ key: "identical", groups: analysis.identicalFiles },
          { key: "descriptions", groups: analysis.matchingDescriptions }] as const).map(({ key, groups }) => (
          <div key={key} className="space-y-2">
            <h3 className="text-sm font-semibold">{t("inventory.evidence." + key)} ({groups.length})</h3>
            <p className={muted}>{t("inventory.explain." + key)}</p>
            {groups.map(([shared, members]) => (
              <EvidenceGroup
                key={shared}
                kind={key}
                shared={shared}
                members={members}
                sourceLabel={sourceLabel}
                showInstallation={showInstallation}
              />
            ))}
          </div>
        ))}
        {(analysis.identicalFiles.length > 0 || analysis.matchingDescriptions.length > 0) && (
          <p className={muted}>{t("inventory.review")}</p>
        )}
      </section>

      <section id="inventory-installations" className="min-w-0 space-y-3" aria-labelledby="inventory-installations-heading">
        <h2 id="inventory-installations-heading" className="text-lg font-semibold">{t("inventory.installations")}</h2>
        {manifest.installations.length === 0 ? <p className={muted}>{t("inventory.noInstallations")}</p> : (
          <>
            <div className="grid gap-2 @md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <label className="grid min-w-0 gap-1 text-sm">
                {t("inventory.search")}
                <input
                  type="search"
                  value={query}
                  onChange={(event) => { setQuery(event.currentTarget.value); setPage(1); }}
                  autoComplete="off"
                  spellCheck={false}
                  className={field}
                  placeholder={t("inventory.searchPlaceholder")}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                {t("inventory.sourceFilter")}
                <select
                  value={rootId}
                  onChange={(event) => { setRootId(event.currentTarget.value); setPage(1); }}
                  className={field}
                >
                  <option value="">{t("inventory.allSources")}</option>
                  {manifest.roots.map((root, index) => (
                    <option key={root.id} value={root.id}>#{index + 1} {t("inventory.kind." + root.kind)}</option>
                  ))}
                </select>
              </label>
            </div>
            {filtered.length === 0
              ? <p role="status" className={muted}>{t("inventory.noMatches")}</p>
              : <div className="flex flex-wrap items-center justify-between gap-2">
                  <p role="status" className={muted}>
                    {t("inventory.range")
                      .replace("{first}", String(first + 1))
                      .replace("{last}", String(first + visible.length))
                      .replace("{total}", String(filtered.length))}
                  </p>
                  {pages > 1 && (
                    <nav className="flex flex-wrap gap-2" aria-label={t("inventory.pagination")}>
                      <button type="button" className={secondary} disabled={page === 1} onClick={() => setPage(page - 1)}>
                        {t("inventory.previous")}
                      </button>
                      <button type="button" className={secondary} disabled={page === pages} onClick={() => setPage(page + 1)}>
                        {t("inventory.next")}
                      </button>
                    </nav>
                  )}
                </div>}
            <ul className="space-y-2">
              {visible.map((installation) => (
                <li
                  key={installation.id}
                  id={"installation-" + installation.id}
                  tabIndex={-1}
                  className={surface + " space-y-2 scroll-m-4 " + focus}
                >
                  <h3 className={"font-semibold " + wrap}><bdi>{installation.name}</bdi></h3>
                  <p className={muted + " whitespace-pre-wrap " + wrap}><bdi>{installation.description}</bdi></p>
                  <p className={"text-xs text-muted-foreground " + wrap}>SHA-256 <code dir="ltr">{installation.skillMdSha256}</code></p>
                  <InstallationLocations installation={installation} sourceLabel={sourceLabel} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

function EvidenceGroup({
  kind, shared, members, sourceLabel, showInstallation,
}: {
  kind: "identical" | "descriptions";
  shared: string;
  members: InventoryInstallation[];
  sourceLabel: SourceLabel;
  showInstallation: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <details className="min-w-0 rounded-md border border-border bg-background p-2" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className={"cursor-pointer rounded text-sm font-medium " + focus + " " + wrap}>
        <bdi>{members[0].name}</bdi>
        {" · " + t("inventory.evidenceGroup").replace("{count}", String(members.length))}
      </summary>
      {expanded && (
        <div className="mt-2 space-y-2">
          <p className={"text-sm " + wrap}>
            {kind === "identical"
              ? <>SHA-256 <code dir="ltr">{shared}</code></>
              : <><span className="font-medium">{t("inventory.normalizedDescription")}</span> <bdi>{shared}</bdi></>}
          </p>
          <ul className="space-y-2">
            {members.map((member) => (
              <li key={member.id} className="space-y-1 border-t border-border pt-2 text-sm">
                <p className={"font-medium " + wrap}><bdi>{member.name}</bdi></p>
                {kind === "descriptions" && <p className={"text-xs text-muted-foreground " + wrap}>SHA-256 <code dir="ltr">{member.skillMdSha256}</code></p>}
                <InstallationLocations installation={member} sourceLabel={sourceLabel} />
                <button
                  type="button"
                  className={"rounded text-left text-sm font-medium underline underline-offset-4 " + focus}
                  onClick={() => showInstallation(member.id)}
                >
                  {t("inventory.viewInstallation")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}

function InstallationLocations({ installation, sourceLabel }: { installation: InventoryInstallation; sourceLabel: SourceLabel }) {
  const { t } = useTranslation();
  return (
    <div className={"space-y-1 text-xs " + wrap}>
      {installation.compatibility && (
        <p>{t("inventory.compatibility")} <bdi>{installation.compatibility}</bdi></p>
      )}
      <ul className="space-y-1">
        {installation.locations.map(({ rootId, relativePath }) => (
          <li key={rootId + "/" + relativePath} className="flex min-w-0 flex-wrap gap-x-2">
            <span className="text-muted-foreground">{sourceLabel(rootId)}</span>
            <code className="min-w-0" dir="ltr"><bdi>{relativePath}</bdi></code>
          </li>
        ))}
      </ul>
    </div>
  );
}
