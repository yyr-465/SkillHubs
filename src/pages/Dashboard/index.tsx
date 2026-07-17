import { useEffect, useRef, useState } from "react";
import { BookOpen, Layers, AlertCircle, Radio, Scan, Star, Sparkles, Loader2, Upload, Clock, AlertTriangle } from "lucide-react";
import { useSkillStore } from "@/store/skillStore";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "@/i18n";
import { useNavigate } from "react-router-dom";
import CategoryBadge from "@/components/CategoryBadge";
import RiskBadge from "@/components/RiskBadge";

interface CategorizeProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  current_skill: string | null;
  running: boolean;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [catProgress, setCatProgress] = useState<CategorizeProgress | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [catError, setCatError] = useState<string | null>(null);
  const [favCount, setFavCount] = useState<number>(0);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const { stats, isLoading, error, fetchStats, scanSkills, clearError, importSkillsFromJson, recentViews, fetchRecentViews, fetchAllTags, conflictCount, fetchConflictCount } = useSkillStore();

  useEffect(() => {
    clearError();
    fetchStats();
    fetchAllTags();
    fetchRecentViews();
    fetchConflictCount();
    invoke<number>("get_favorites_count").then(setFavCount).catch(() => {});
  }, [fetchStats, clearError, fetchAllTags, fetchRecentViews, fetchConflictCount]);

  useEffect(() => {
    if (catProgress?.running) {
      pollingRef.current = setInterval(async () => {
        try {
          const prog = await invoke<CategorizeProgress>("get_categorize_progress");
          setCatProgress(prog);
          if (!prog.running) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            fetchStats();
            fetchConflictCount();
          }
        } catch (e) {
          console.error("Failed to poll progress", e);
        }
      }, 2000);
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [catProgress?.running, fetchConflictCount, fetchStats]);

  const handleScan = async () => {
    await scanSkills();
    await fetchStats();
    invoke<number>("get_favorites_count").then(setFavCount).catch(() => {});
  };

  const handleImport = async () => {
    setImporting(true);
    setImportMessage(null);
    try {
      // Try Tauri native dialog first
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const file = await open({
        multiple: false,
        filters: [{ name: t("dialog.jsonFilter"), extensions: ["json"] }],
      });
      if (!file) {
        setImporting(false);
        return;
      }
      const content = await readTextFile(file as string);
      const result = await importSkillsFromJson(content);
      if (result.errors.length > 0) {
        setImportMessage(
          t("dialog.importSuccess").replace("{count}", String(result.success_count)) +
            " Errors: " + result.errors.slice(0, 3).join("; ")
        );
      } else {
        setImportMessage(
          t("dialog.importSuccess").replace("{count}", String(result.success_count))
        );
      }
      await fetchStats();
      invoke<number>("get_favorites_count").then(setFavCount).catch(() => {});
    } catch (_e) {
      // Fallback to <input type="file"> if Tauri dialog is unavailable
      try {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        const text = await new Promise<string>((resolve, reject) => {
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) { reject(new Error("No file selected")); return; }
            resolve(await file.text());
          };
          input.click();
        });
        const result = await importSkillsFromJson(text);
        if (result.errors.length > 0) {
          setImportMessage(
            t("dashboard.importSuccess").replace("{count}", String(result.success_count)) +
              " Errors: " + result.errors.slice(0, 3).join("; ")
          );
        } else {
          setImportMessage(
            t("dashboard.importSuccess").replace("{count}", String(result.success_count))
          );
        }
        await fetchStats();
        invoke<number>("get_favorites_count").then(setFavCount).catch(() => {});
      } catch (fallbackErr) {
        setImportMessage(t("dialog.importError").replace("{error}", String(fallbackErr)));
      }
    }
    setImporting(false);
  };

  if (isLoading && !stats) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[--color-muted-foreground]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-[--color-muted-foreground]">
            {t("dashboard.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={importing}
            className="inline-flex items-center gap-2 rounded-lg border border-[--color-border] bg-[--color-card] px-4 py-2 text-sm font-medium text-[--color-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t("dashboard.import")}
          </button>
          <button
            onClick={handleScan}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-[--color-border] bg-[--color-card] px-4 py-2 text-sm font-medium text-[--color-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Scan className="h-4 w-4" />
            )}
            {isLoading ? t("dashboard.scanning") : t("dashboard.scanNow")}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {importMessage && (
        <div
          className={ "rounded-lg border px-4 py-3 text-sm " + (importMessage.includes("Error") ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400" : "border-green-500/30 bg-green-500/10 text-green-400")}
        >
          {importMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={BookOpen} label={t("dashboard.totalSkills")} value={stats ? String(stats.total_count) : "\u2014"} />
        <StatCard icon={Layers} label={t("dashboard.categorized")} value={stats ? String(stats.categorized_count) : "\u2014"} />
        <StatCard icon={AlertCircle} label={t("dashboard.uncategorized")} value={stats ? String(stats.uncategorized_count) : "\u2014"} />
        <StatCard icon={Radio} label={t("dashboard.categories")} value={stats ? String(stats.category_counts.length) : "\u2014"} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          onClick={() => navigate("/skills?favorites=true")}
          className="cursor-pointer rounded-lg border border-[--color-border] bg-[--color-card] p-4 transition-colors hover:border-[--color-primary]/40"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-yellow-500/10">
              <Star className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-[--color-muted-foreground]">{t("dashboard.favorites")}</p>
              <p className="text-xl font-semibold">{favCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownCard title={t("dashboard.byCategory")}>
          {stats && stats.category_counts.length > 0 ? (
            <div className="space-y-2">
              {stats.category_counts.slice(0, 15).map((c) => (
                <BreakdownRow
                  key={c.category}
                  count={c.count}
                  total={stats.total_count}
                  badge={c.category !== "(uncategorized)" ? <CategoryBadge category={c.category} /> : null}
                />
              ))}
              {stats.category_counts.length > 15 && (
                <p className="pt-1 text-xs text-[--color-muted-foreground]">
                  +{stats.category_counts.length - 15} {t("dashboard.moreCategories")}
                </p>
              )}
            </div>
          ) : (
            <EmptyDetail text={t("dashboard.noData")} />
          )}
        </BreakdownCard>

        <BreakdownCard title={t("dashboard.byRisk")}>
          {stats && stats.risk_counts.length > 0 ? (
            <div className="space-y-2">
              {stats.risk_counts.map((r) => (
                <BreakdownRow
                  key={r.risk}
                  count={r.count}
                  total={stats.total_count}
                  badge={<RiskBadge risk={r.risk} />}
                />
              ))}
            </div>
          ) : (
            <EmptyDetail text={t("dashboard.noData")} />
          )}
        </BreakdownCard>
      </div>

      {catError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {catError}
        </div>
      )}

      {/* Recently Viewed */}
      {recentViews.length > 0 && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-[--color-muted-foreground]" />
            {t("dashboard.recentViews")}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recentViews.map((skill) => (
              <div
                key={skill.id}
                onClick={() => navigate("/skills/" + skill.id)}
                className="group cursor-pointer rounded-lg border border-[--color-border]/60 bg-[--color-card]/60 p-3 transition-colors hover:border-[--color-primary]/40 hover:bg-[--color-card]"
              >
                <p className="truncate text-xs font-medium text-[--color-foreground] group-hover:text-[--color-primary]">
                  {skill.name}
                </p>
                {skill.category && (
                  <p className="mt-1 truncate text-[10px] text-[--color-muted-foreground]">
                    {skill.category}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categorization Conflicts */}
      {conflictCount > 0 && (
        <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            {t("dashboard.conflicts")}
          </h2>
          <div className="flex items-center justify-between">
            <p className="text-2xl font-bold text-red-500">{conflictCount}</p>
            <button
              onClick={() => navigate("/conflicts")}
              className="text-sm text-[--color-primary] hover:underline"
            >
              {t("dashboard.conflictsView")} &rarr;
            </button>
          </div>
        </div>
      )}

      {/* AI Categorization */}
      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              {t("dashboard.aiCategorization")}
            </h2>
          </div>
          {stats && stats.uncategorized_count > 0 && !catProgress?.running && (
            <button
              onClick={async () => {
                setCatError(null);
                try {
                  await invoke("categorize_skills");
                  setCatProgress({ total: 0, processed: 0, succeeded: 0, failed: 0, current_skill: null, running: true });
                } catch (e) {
                  setCatError(String(e));
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[--color-border] bg-[--color-card] px-4 py-2 text-sm font-medium text-[--color-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {t("dashboard.categorize")}
            </button>
          )}
        </div>

        {!stats?.uncategorized_count && (
          <p className="text-sm text-[--color-muted-foreground]">{t("dashboard.categorizeDone")}</p>
        )}

        {catProgress?.running && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[--color-muted-foreground]">
                {catProgress.current_skill ? <>{catProgress.current_skill} - </> : null}
                {t("dashboard.categorizeProgress").replace("{processed}", String(catProgress.processed)).replace("{total}", String(catProgress.total))}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[--color-muted]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
                style={{ width: catProgress.total > 0 ? `${(catProgress.processed / catProgress.total) * 100}%` : "0%" }}
              />
            </div>
            <p className="text-xs text-[--color-muted-foreground]">
              {t("dashboard.categorizeResult").replace("{succeeded}", String(catProgress.succeeded)).replace("{failed}", String(catProgress.failed))}
            </p>
          </div>
        )}

        {catProgress && !catProgress.running && catProgress.total > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <div className="rounded-full bg-green-500/10 p-1">
              <Sparkles className="h-3.5 w-3.5 text-green-500" />
            </div>
            <span>
              {t("dashboard.categorizeResult").replace("{succeeded}", String(catProgress.succeeded)).replace("{failed}", String(catProgress.failed))}
            </span>
          </div>
        )}
      </div>

      {stats && stats.total_count === 0 && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-[--color-border] py-16">
          <Scan className="h-10 w-10 text-[--color-muted-foreground]" />
          <p className="text-sm text-[--color-muted-foreground]">{t("dashboard.empty")}</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[--color-primary]/10">
          <Icon className="h-5 w-5 text-[--color-primary]" />
        </div>
        <div>
          <p className="text-xs text-[--color-muted-foreground]">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function BreakdownCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </div>
  );
}

function BreakdownRow({ count, total, badge }: { count: number; total: number; badge?: React.ReactNode }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="w-6 text-right text-xs text-[--color-muted-foreground]">{count}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[--color-muted]">
        <div className="h-full rounded-full bg-[--color-primary]/60 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 text-right text-xs text-[--color-muted-foreground]">{pct}%</div>
      {badge}
    </div>
  );
}

function EmptyDetail({ text }: { text: string }) {
  return <p className="py-6 text-center text-xs text-[--color-muted-foreground]">{text}</p>;
}



