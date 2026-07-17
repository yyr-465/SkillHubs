import { ChevronDown, Heart } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useSkillStore } from "@/store/skillStore";
import { useEffect } from "react";

export default function FilterBar() {
  const { t } = useTranslation();
  const { filterOptions, skillQuery, setFilter, allTags, fetchAllTags } = useSkillStore();

  const selectedCategory = skillQuery.category ?? "";
  const selectedRisk = skillQuery.risk ?? "";
  const selectedSource = skillQuery.source ?? "";
  const favoriteOnly = skillQuery.favorite_only ?? false;
  const selectedTagId = skillQuery.tag_ids?.[0] ?? "";

  useEffect(() => { fetchAllTags(); }, [fetchAllTags]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* category */}
      <div className="relative">
        <select
          value={selectedCategory}
          onChange={(e) => setFilter({ category: e.target.value || undefined })}
          className="appearance-none rounded-md border border-[--color-border] bg-[--color-card] px-3 py-1.5 pr-8 text-xs text-[--color-foreground] outline-none transition-colors hover:border-[--color-primary]/40 focus:border-[--color-primary]"
        >
          <option value="">{t("skillList.allCategories")}</option>
          {filterOptions.categories.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.value} ({cat.count})</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[--color-muted-foreground]" />
      </div>

      {/* risk */}
      <div className="relative">
        <select
          value={selectedRisk}
          onChange={(e) => setFilter({ risk: e.target.value || undefined })}
          className="appearance-none rounded-md border border-[--color-border] bg-[--color-card] px-3 py-1.5 pr-8 text-xs text-[--color-foreground] outline-none transition-colors hover:border-[--color-primary]/40 focus:border-[--color-primary]"
        >
          <option value="">{t("skillList.allRisks")}</option>
          {filterOptions.risks.map((risk) => (
            <option key={risk.value} value={risk.value}>{risk.value} ({risk.count})</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[--color-muted-foreground]" />
      </div>

      {/* source */}
      <div className="relative">
        <select
          value={selectedSource}
          onChange={(e) => setFilter({ source: e.target.value || undefined })}
          className="appearance-none rounded-md border border-[--color-border] bg-[--color-card] px-3 py-1.5 pr-8 text-xs text-[--color-foreground] outline-none transition-colors hover:border-[--color-primary]/40 focus:border-[--color-primary]"
        >
          <option value="">{t("skillList.allSources")}</option>
          {filterOptions.sources.map((src) => (
            <option key={src.value} value={src.value}>{src.value} ({src.count})</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[--color-muted-foreground]" />
      </div>

      {/* Favorites only toggle */}
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[--color-border] bg-[--color-card] px-2.5 py-1.5 text-xs text-[--color-foreground] transition-colors hover:border-[--color-primary]/40">
        <input
          type="checkbox"
          checked={favoriteOnly}
          onChange={(e) => setFilter({ favorite_only: e.target.checked || undefined })}
          className="h-3.5 w-3.5 accent-[--color-primary]"
        />
        <Heart className={`h-3 w-3 ${favoriteOnly ? "text-red-400" : "text-[--color-muted-foreground]"}`} />
        {t("skillList.favoriteOnly")}
      </label>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="relative">
          <select
            value={selectedTagId}
            onChange={(e) => setFilter({ tag_ids: e.target.value ? [Number(e.target.value)] : undefined })}
            className="appearance-none rounded-md border border-[--color-border] bg-[--color-card] px-3 py-1.5 pr-8 text-xs text-[--color-foreground] outline-none transition-colors hover:border-[--color-primary]/40 focus:border-[--color-primary]"
          >
            <option value="">{t("skillList.allTags")}</option>
            {allTags.map(tag => (
              <option key={tag.id} value={tag.id}>{tag.name} ({tag.skill_count ?? 0})</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[--color-muted-foreground]" />
        </div>
      )}
    </div>
  );
}
