import { ArrowUp, ArrowDown } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useSkillStore } from "@/store/skillStore";

const SORT_OPTIONS = [
  { field: "Name", labelKey: "skillList.sortName" },
  { field: "DateAdded", labelKey: "skillList.sortDate" },
  { field: "Category", labelKey: "skillList.sortCategory" },
  { field: "Risk", labelKey: "skillList.sortRisk" },
  { field: "Source", labelKey: "skillList.sortSource" },
] as const;

function parseSortField(value: string) {
  return SORT_OPTIONS.find((option) => option.field === value)?.field;
}

export default function SortDropdown() {
  const { t } = useTranslation();
  const { skillQuery, setFilter } = useSkillStore();

  const currentField = skillQuery.sort_field ?? "";
  const currentDir = skillQuery.sort_direction ?? "Asc";

  return (
    <div className="flex items-center gap-2">
      {/* sort field selector */}
      <div className="relative">
        <select
          value={currentField}
          onChange={(e) => setFilter({ sort_field: parseSortField(e.target.value) })}
          className="appearance-none rounded-md border border-[--color-border] bg-[--color-card] px-3 py-1.5 pr-8 text-xs text-[--color-foreground] outline-none transition-colors hover:border-[--color-primary]/40 focus:border-[--color-primary]"
        >
          <option value="">{t("skillList.sortBy")}</option>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.field} value={opt.field}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {/* direction toggle */}
      <button
        onClick={() =>
          setFilter({
            sort_direction: currentDir === "Asc" ? "Desc" : "Asc",
          })
        }
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[--color-border] bg-[--color-card] text-[--color-muted-foreground] transition-colors hover:border-[--color-primary]/40 hover:text-[--color-foreground]"
        title={currentDir === "Asc" ? t("skillList.ascending") : t("skillList.descending")}
      >
        {currentDir === "Asc" ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

