import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "@/i18n";
import { useSkillStore } from "@/store/skillStore";
import FilterBar from "@/components/FilterBar";
import SearchBar from "@/components/SearchBar";
import SortDropdown from "@/components/SortDropdown";
import ViewToggle from "@/components/ViewToggle";
import Pagination from "@/components/Pagination";
import VirtualSkillList from "@/components/VirtualSkillList";
import SkillGrid from "@/components/SkillGrid";
import BatchOperationBar from "@/components/BatchOperationBar";
import EmptyState from "@/components/EmptyState";
import LoadLocalSkills from "@/components/LoadLocalSkills";
import { CheckSquare, Loader2, ListChecks, RotateCcw } from "lucide-react";
import { IS_TAURI } from "@/lib/runtime";

const VALID_FAVORITE_PARAM = "true";

export default function SkillList() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const {
    skills,
    totalCount,
    isLoading,
    error,
    skillQuery,
    viewMode,
    pageSize,
    currentPage,
    selectionMode,
    toggleSelectionMode,
    clearSelection,
    fetchFilters,
    querySkills,
    setFilter,
  } = useSkillStore();

  // Read URL params on mount: ?favorites=, ?category=, ?risk=
  useEffect(() => {
    const favParam = searchParams.get("favorites");
    if (favParam === VALID_FAVORITE_PARAM) {
      setFilter({ favorite_only: true });
    }

    const catParam = searchParams.get("category");
    if (catParam && catParam !== skillQuery.category) {
      setFilter({ category: catParam });
    }

    const riskParam = searchParams.get("risk");
    if (riskParam && riskParam !== skillQuery.risk) {
      setFilter({ risk: riskParam });
    }

    const tagIdParam = searchParams.get("tagId");
    if (tagIdParam && tagIdParam !== String(skillQuery.tag_ids?.[0])) {
      setFilter({ tag_ids: [Number(tagIdParam)] });
    }
  }, []); // only on mount

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  // Web always fetches the full list; virtualisation is desktop-only.
  const virtualEnabled = IS_TAURI ? localStorage.getItem("skillhub_virtual_list") !== "false" : true;

  useEffect(() => {
    querySkills({
      ...skillQuery,
      offset: virtualEnabled ? 0 : (currentPage - 1) * pageSize,
      limit: virtualEnabled ? 10000 : pageSize,
    });
  }, [skillQuery, currentPage, pageSize, querySkills, virtualEnabled]);

  const hasSort = !!skillQuery.sort_field;

  return (
    <>
      {/* Fixed sticky header */}
      <div className="sticky top-0 z-[100] isolate -mx-6 -mt-6 px-6 pt-6 pb-3 bg-white/60 dark:bg-gray-900/90 backdrop-blur-[15px]">
        {/* Title */}
        <div>
          <h1 className="text-xl font-semibold">{t("skillList.title")}</h1>
          <p className="mt-1 text-sm text-[--color-muted-foreground]">
            {t("skillList.subtitle")}
          </p>
        </div>

        {!IS_TAURI && (
          <div className="mt-3">
            <LoadLocalSkills />
          </div>
        )}

        {/* Row 1: Search + Clear Sort */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 max-w-md">
            <SearchBar />
          </div>
          {hasSort && (
            <button
              onClick={() => setFilter({ sort_field: undefined })}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[--color-border] px-2.5 py-1.5 text-xs text-[--color-muted-foreground] transition-colors hover:bg-[--color-accent] hover:text-[--color-foreground]"
            >
              <RotateCcw className="h-3 w-3" />
              {t("skillList.clearFilters")}
            </button>
          )}
        </div>

        {/* Row 2: Category / Risk / Source / Favorites / Sort / Select / View */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FilterBar />
          <div className="flex items-center gap-2">
            <SortDropdown />
            {IS_TAURI && (
            <button
              onClick={() => {
                if (selectionMode) clearSelection();
                toggleSelectionMode();
              }}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                selectionMode
                  ? "border-[--color-primary] bg-[--color-primary]/10 text-[--color-primary]"
                  : "border-[--color-border] text-[--color-muted-foreground] hover:bg-[--color-accent]"
              }`}
              title={t("skillList.batchMode")}
            >
              <ListChecks className="h-3.5 w-3.5" />
            </button>
            )}
          </div>
          <div className="ml-auto pl-4 border-l border-[--color-border]">
            <ViewToggle />
          </div>
        </div>
      </div>
      {/* Content area */}
      <div className="flex flex-col gap-4">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-[--color-muted-foreground]" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Content */}
        {!isLoading && skills.length > 0 && (
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-[--color-muted-foreground]">
              {t("skillList.total").replace("{count}", String(totalCount))}
            </p>
            {selectionMode && (
              <span className="flex items-center gap-1 text-xs text-[--color-primary]">
                <CheckSquare className="h-3.5 w-3.5" />
                {t("skillList.selected").replace("{count}", String(useSkillStore.getState().selectedIds.size))}
              </span>
            )}
          </div>
        )}

        {!isLoading && skills.length > 0 && IS_TAURI && virtualEnabled && (
          <VirtualSkillList key={`${viewMode}:${JSON.stringify(skillQuery)}`} skills={skills} viewMode={viewMode} />
        )}

        {!isLoading && skills.length > 0 && IS_TAURI && !virtualEnabled && <Pagination />}

        {!isLoading && skills.length > 0 && !IS_TAURI && (
          <SkillGrid skills={skills} viewMode={viewMode} />
        )}

        {!isLoading && skills.length === 0 && !error && (
          <EmptyState
            message={
              skillQuery.favorite_only
                ? t("skillList.noFavorites")
                : t("skillList.noResults")
            }
          />
        )}
      </div>

      {/* Batch operation bar (desktop only) */}
      {IS_TAURI && selectionMode && <BatchOperationBar />}
    </>
  );
}




