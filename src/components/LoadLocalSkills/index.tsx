import { useState } from "react";
import { FolderOpen, Loader2, RotateCcw } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useSkillStore } from "@/store/skillStore";
import { pickSkillDirectory } from "@/lib/localSkills";
import { setLocalSkills, hasLocalSkills } from "@/lib/webApi";

/**
 * Opt-in, client-side local folder preview. Uses the File System Access API
 * (Chrome/Edge) or an <input webkitdirectory> fallback; files are parsed
 * entirely in the browser and are never uploaded.
 */
export default function LoadLocalSkills() {
  const { t } = useTranslation();
  const { fetchStats, fetchFilters, querySkills, skillQuery } = useSkillStore();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(hasLocalSkills());
  const [message, setMessage] = useState<string | null>(null);

  const reload = async () => {
    await fetchStats();
    await fetchFilters();
    await querySkills({ ...skillQuery, offset: 0, limit: 10000 });
  };

  const handleLoad = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await pickSkillDirectory();
      if (result.skills.length === 0 && result.errors.length === 0) {
        setMessage(null); // user cancelled
      } else {
        setLocalSkills(result.skills, result.contents);
        setLoaded(true);
        await reload();
        let msg = t("localSkills.loaded").replace("{count}", String(result.skills.length));
        if (result.errors.length > 0) {
          msg += " · " + t("localSkills.skipped").replace("{count}", String(result.errors.length));
        }
        setMessage(msg);
      }
    } catch (e) {
      setMessage(t("localSkills.error").replace("{error}", String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLocalSkills(null);
    setLoaded(false);
    setMessage(null);
    await reload();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleLoad}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-[--color-border] bg-[--color-card] px-4 py-2 text-sm font-medium text-[--color-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
          {loading ? t("localSkills.loading") : t("localSkills.load")}
        </button>
        {loaded && (
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[--color-border] px-3 py-2 text-sm text-[--color-muted-foreground] transition-colors hover:bg-[--color-accent]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("localSkills.reset")}
          </button>
        )}
      </div>
      <p className="text-xs text-[--color-muted-foreground]">{t("localSkills.hint")}</p>
      {message && <p className="text-xs text-[--color-primary]">{message}</p>}
    </div>
  );
}
