import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { useSkillStore } from "@/store/skillStore";
import { useTranslation } from "@/i18n";

export default function ConflictResolution() {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const { conflicts, conflictCount, error, fetchConflicts, fetchConflictCount, resolveConflict, resolveConflicts } = useSkillStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    fetchConflicts();
    fetchConflictCount();
  }, [fetchConflicts, fetchConflictCount]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === conflicts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(conflicts.map((c) => c.skill_id)));
    }
  };

  const handleResolve = async (skillId: string, category: string) => {
    console.log("[ConflictPage] Resolving:", skillId, "->", category);
    setResolving(true);
    try {
      await resolveConflict(skillId, category);
      console.log("[ConflictPage] Resolve OK for", skillId);
    } catch (_e) {
      console.error("[ConflictPage] Resolve failed:", _e);
    }
    setResolving(false);
  };

  const handleBatchResolve = async (useNew: boolean) => {
    if (selected.size === 0) return;
    setResolving(true);
    try {
      const resolutions = Object.fromEntries(
        conflicts
          .filter((conflict) => selected.has(conflict.skill_id))
          .map((conflict) => [conflict.skill_id, useNew ? conflict.new_category : conflict.old_category]),
      );
      await resolveConflicts(resolutions);
    } catch (_e) {
      console.error("Batch resolve failed:", _e);
    }
    setSelected(new Set());
    setResolving(false);
  };

  const allSelected = conflicts.length > 0 && selected.size === conflicts.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          className="text-sm text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground]"
        >
          <ArrowLeft className="inline h-4 w-4" /> {t("conflict.backToDashboard")}
        </button>
      </div>

      <div>
        <h1 className="text-xl font-semibold">{t("conflict.title")}</h1>
        <p className="mt-1 text-sm text-[--color-muted-foreground]">
          {t("conflict.subtitle")}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {conflictCount === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-green-500/30 bg-green-500/5 py-16">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
          <p className="text-sm text-[--color-muted-foreground]">{t("conflict.resolved")}</p>
        </div>
      ) : (
        <>
          {/* Batch actions */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[--color-border] bg-[--color-card] p-3">
            <button
              onClick={toggleSelectAll}
              className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs font-medium text-[--color-foreground] transition-colors hover:bg-[--color-accent]"
            >
              {allSelected ? t("conflict.deselectAll") : t("conflict.selectAll")}
            </button>
            <button
              onClick={() => handleBatchResolve(true)}
              disabled={selected.size === 0 || resolving}
              className="rounded-md border border-[--color-primary]/40 bg-[--color-primary]/10 px-3 py-1.5 text-xs font-medium text-[--color-primary] transition-colors hover:bg-[--color-primary]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("conflict.batchKeepNew")}
            </button>
            <button
              onClick={() => handleBatchResolve(false)}
              disabled={selected.size === 0 || resolving}
              className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs font-medium text-[--color-muted-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("conflict.batchKeepOld")}
            </button>
          </div>

          {/* Conflict items */}
          <div className="flex flex-col gap-4">
            {conflicts.map((conflict) => (
              <div
                key={conflict.skill_id}
                className="rounded-lg border border-[--color-border] bg-[--color-card] p-4"
              >
                <div className="mb-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(conflict.skill_id)}
                    onChange={() => toggleSelect(conflict.skill_id)}
                    className="h-4 w-4 rounded border-[--color-border] accent-[--color-primary]"
                  />
                  <span
                    className="cursor-pointer text-sm font-medium text-[--color-foreground] hover:text-[--color-primary]"
                    onClick={() => navigate("/skills/" + conflict.skill_id)}
                  >
                    {conflict.skill_name}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Old category */}
                  <div className="rounded-md border border-[--color-border] bg-[--color-muted]/50 p-3">
                    <p className="mb-1 text-xs font-medium text-[--color-muted-foreground]">
                      {t("conflict.oldCategory")}: {conflict.old_category}
                    </p>
                    {conflict.old_reason && (
                      <p className="text-xs italic text-[--color-muted-foreground]">
                        {t("conflict.reason")}: {localizeHistoricalReason(conflict.old_reason, lang, t("conflict.reasonLanguageMismatch"))}
                      </p>
                    )}
                  </div>

                  {/* New category */}
                  <div className="rounded-md border border-[--color-primary]/40 bg-[--color-primary]/5 p-3">
                    <p className="mb-1 text-xs font-medium text-[--color-primary]">
                      {t("conflict.newCategory")}: {conflict.new_category}
                    </p>
                    {conflict.new_reason && (
                      <p className="text-xs italic text-[--color-muted-foreground]">
                        {t("conflict.reason")}: {localizeHistoricalReason(conflict.new_reason, lang, t("conflict.reasonLanguageMismatch"))}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleResolve(conflict.skill_id, conflict.old_category)}
                    disabled={resolving}
                    className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs font-medium text-[--color-muted-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("conflict.confirmOld")}
                  </button>
                  <button
                    onClick={() => handleResolve(conflict.skill_id, conflict.new_category)}
                    disabled={resolving}
                    className="rounded-md border border-[--color-primary]/40 bg-[--color-primary]/10 px-3 py-1.5 text-xs font-medium text-[--color-primary] transition-colors hover:bg-[--color-primary]/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("conflict.confirmNew")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function localizeHistoricalReason(reason: string, lang: "zh" | "en", mismatchText: string): string {
  const containsChinese = /[\u3400-\u9fff]/u.test(reason);
  const matchesLanguage = lang === "zh" ? containsChinese : !containsChinese;
  return matchesLanguage ? reason : mismatchText;
}
