import { LayoutGrid, List } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useSkillStore } from "@/store/skillStore";

export default function ViewToggle() {
  const { t } = useTranslation();
  const { viewMode, setViewMode } = useSkillStore();

  return (
    <div className="flex items-center overflow-hidden rounded-md border border-[--color-border]">
      <button
        onClick={() => setViewMode("grid")}
        className={"inline-flex h-8 w-8 items-center justify-center transition-colors " + (
          viewMode === "grid"
            ? "bg-[--color-primary] text-[--color-primary-foreground]"
            : "bg-[--color-card] text-[--color-muted-foreground] hover:text-[--color-foreground]"
        )}
        title={t("skillList.gridView")}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        onClick={() => setViewMode("list")}
        className={"inline-flex h-8 w-8 items-center justify-center transition-colors " + (
          viewMode === "list"
            ? "bg-[--color-primary] text-[--color-primary-foreground]"
            : "bg-[--color-card] text-[--color-muted-foreground] hover:text-[--color-foreground]"
        )}
        title={t("skillList.listView")}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
