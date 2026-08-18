import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Layers, ShieldCheck, ArrowRight, Clock, Sparkles, ExternalLink } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useSkillStore } from "@/store/skillStore";
import CategoryBadge from "@/components/CategoryBadge";
import RiskBadge from "@/components/RiskBadge";
import LoadLocalSkills from "@/components/LoadLocalSkills";

export default function WebDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { stats, fetchStats, fetchRecentViews, recentViews } = useSkillStore();

  useEffect(() => {
    fetchStats();
    fetchRecentViews();
  }, [fetchStats, fetchRecentViews]);

  const total = stats?.total_count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <section className="rounded-xl border border-[--color-primary]/30 bg-[--color-primary]/5 p-6 sm:p-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[--color-primary]">
          {t("web.eyebrow")}
        </p>
        <h1 className="text-2xl font-semibold">{t("app.name")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[--color-muted-foreground]">
          {t("web.subtitle")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => navigate("/skills")}
            className="inline-flex items-center gap-2 rounded-lg bg-[--color-primary] px-4 py-2 text-sm font-medium text-[--color-primary-foreground] transition-opacity hover:opacity-90"
          >
            <Layers className="h-4 w-4" />
            {t("web.browseSkills")}
            <ArrowRight className="h-4 w-4" />
          </button>
          <a
            href="https://github.com/yyr-465/SkillHubs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-[--color-border] bg-[--color-card] px-4 py-2 text-sm font-medium text-[--color-foreground] transition-colors hover:bg-[--color-accent]"
          >
            <ExternalLink className="h-4 w-4" />
            {t("web.viewSource")}
          </a>
        </div>
        <div className="mt-5">
          <LoadLocalSkills />
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={BookOpen} label={t("dashboard.totalSkills")} value={String(total)} />
        <StatCard icon={Layers} label={t("dashboard.categories")} value={String(stats?.category_counts.length ?? 0)} />
        <StatCard icon={ShieldCheck} label={t("web.riskLevels")} value={String(stats?.risk_counts.length ?? 0)} />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownCard title={t("dashboard.byCategory")}>
          {stats && stats.category_counts.length > 0 ? (
            <div className="space-y-2">
              {stats.category_counts.slice(0, 12).map((c) => (
                <BreakdownRow
                  key={c.category}
                  count={c.count}
                  total={total}
                  badge={c.category !== "(uncategorized)" ? <CategoryBadge category={c.category} /> : null}
                />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-[--color-muted-foreground]">{t("dashboard.noData")}</p>
          )}
          <p className="mt-3 border-t border-[--color-border] pt-2 text-[10px] leading-relaxed text-[--color-muted-foreground]">{t("web.categoryNote")}</p>
        </BreakdownCard>

        <BreakdownCard title={t("dashboard.byRisk")}>
          {stats && stats.risk_counts.length > 0 ? (
            <div className="space-y-2">
              {stats.risk_counts.map((r) => (
                <BreakdownRow key={r.risk} count={r.count} total={total} badge={<RiskBadge risk={r.risk} />} />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-[--color-muted-foreground]">{t("dashboard.noData")}</p>
          )}
        </BreakdownCard>
      </div>

      {/* Recently viewed */}
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
                  <p className="mt-1 truncate text-[10px] text-[--color-muted-foreground]">{skill.category}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Read-only notice */}
      <div className="flex items-start gap-3 rounded-lg border border-[--color-border] bg-[--color-card] p-4">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[--color-primary]" />
        <p className="text-xs leading-relaxed text-[--color-muted-foreground]">{t("web.readOnly")}</p>
      </div>
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
        <div className="h-full rounded-full bg-[--color-primary]/60" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 text-right text-xs text-[--color-muted-foreground]">{pct}%</div>
      {badge}
    </div>
  );
}
