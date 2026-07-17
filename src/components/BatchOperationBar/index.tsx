import { useState } from "react";
import { useTranslation } from "@/i18n";
import { useSkillStore } from "@/store/skillStore";
import TagBadge from "@/components/TagBadge";
import { Download, Layers, Tags, X } from "lucide-react";
import ExportDialog from "@/components/ExportDialog";

export default function BatchOperationBar() {
  const { t } = useTranslation();
  const {
    selectionMode,
    selectedIds,
    clearSelection,
    selectAll,
    batchCategorize,
    allTags,
    fetchAllTags,
    assignTag,
  } = useSkillStore();
  const [categorizing, setCategorizing] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [catCategory, setCatCategory] = useState("");
  const [catRisk, setCatRisk] = useState("");
  const count = selectedIds.size;

  if (!selectionMode || count === 0) return null;

  const handleBatchCategorize = async () => {
    setCategorizing(true);
    await batchCategorize({
      skill_ids: Array.from(selectedIds),
      category: catCategory || undefined,
      risk: catRisk || undefined,
    });
    setCategorizing(false);
    setShowCatDialog(false);
    setCatCategory("");
    setCatRisk("");
  };

  return (
    <>
      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[--color-border] bg-white/60 px-4 py-3 shadow-lg backdrop-blur-lg dark:border-gray-700/60 dark:bg-gray-900/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm text-[--color-muted-foreground]">
              {t("skillList.selected").replace("{count}", String(count))}
            </span>
            <button
              onClick={selectAll}
              className="text-xs text-[--color-primary] hover:underline"
            >
              {t("skillList.selectAll")}
            </button>
            <button
              onClick={clearSelection}
              className="text-xs text-[--color-muted-foreground] hover:underline"
            >
              {t("skillList.deselectAll")}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCatDialog(true)}
              disabled={categorizing}
              className="inline-flex items-center gap-1.5 rounded-md border border-[--color-border] bg-[--color-background] px-3 py-1.5 text-xs text-[--color-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Layers className="h-3.5 w-3.5" />
              {t("skillList.batchCategorize")}
            </button>
            <button
              onClick={() => setShowExportDialog(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[--color-border] bg-[--color-background] px-3 py-1.5 text-xs text-[--color-foreground] transition-colors hover:bg-[--color-accent]"
            >
              <Download className="h-3.5 w-3.5" />
              {t("skillList.batchExport")}
            </button>
            <button
              onClick={() => { fetchAllTags(); setShowTagDialog(true); }}
              className="inline-flex items-center gap-1.5 rounded-md border border-[--color-border] bg-[--color-background] px-3 py-1.5 text-xs text-[--color-foreground] transition-colors hover:bg-[--color-accent]"
            >
              <Tags className="h-3.5 w-3.5" />
              {t("skillList.batchAddTag")}
            </button>
            <button onClick={clearSelection}
              className="rounded-md p-1.5 text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Batch categorize dialog */}
      {showCatDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-white/60 backdrop-blur-sm dark:bg-black/60"
            onClick={() => setShowCatDialog(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-lg border border-[--color-border] bg-[--color-card] p-6 shadow-xl">
            <h3 className="mb-4 text-sm font-semibold">
              {t("skillList.batchCategorize")}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[--color-muted-foreground]">
                  {t("skillEditor.category")}
                </label>
                <input
                  value={catCategory}
                  onChange={(e) => setCatCategory(e.target.value)}
                  placeholder={t("skillEditor.selectCategory")}
                  className="w-full rounded-md border border-[--color-input] bg-[--color-background] px-3 py-2 text-sm text-[--color-foreground] outline-none focus:ring-2 focus:ring-[--color-ring]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[--color-muted-foreground]">
                  {t("skillEditor.risk")}
                </label>
                <select
                  value={catRisk}
                  onChange={(e) => setCatRisk(e.target.value)}
                  className="w-full rounded-md border border-[--color-input] bg-[--color-background] px-3 py-2 text-sm text-[--color-foreground] outline-none focus:ring-2 focus:ring-[--color-ring]"
                >
                  <option value="">{t("skillEditor.selectRisk")}</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowCatDialog(false)}
                className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs text-[--color-muted-foreground]"
              >
                {t("skillEditor.cancel")}
              </button>
              <button
                onClick={handleBatchCategorize}
                disabled={!catCategory && !catRisk}
                className="rounded-md bg-[--color-primary] px-3 py-1.5 text-xs font-medium text-[--color-primary-foreground] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("skillEditor.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch add tag dialog */}
      {showTagDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="bg-white/60 backdrop-blur-sm dark:bg-black/60 absolute inset-0" onClick={() => setShowTagDialog(false)} />
          <div className="relative z-10 w-80 rounded-lg border border-[--color-border] bg-[--color-card] p-4 shadow-xl">
            <h3 className="mb-3 text-sm font-medium">{t("batchOp.selectTag")}</h3>
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => (
                <TagBadge
                  key={tag.id} name={tag.name} color={tag.color} size="md"
                  onClick={async () => {
                    for (const sid of selectedIds) {
                      await assignTag({ skill_id: sid, tag_id: tag.id });
                    }
                    setShowTagDialog(false);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {showExportDialog && (
        <ExportDialog
          open={showExportDialog}
          onClose={() => setShowExportDialog(false)}
        />
      )}
    </>
  );
}