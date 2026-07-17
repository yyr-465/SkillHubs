import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/i18n";
import { useSkillStore } from "@/store/skillStore";
import { Download, FileJson, FileSpreadsheet, FileText, FolderArchive, X, Check } from "lucide-react";

const ALL_COLUMNS = [
  "name", "description", "category", "risk", "tags",
  "source", "date_added", "id", "favorite", "icon", "source_path",
] as const;

const DEFAULT_COLS = new Set(["name", "description", "category", "risk", "tags", "source", "date_added"]);

type ExportFormat = "json" | "csv" | "report" | "package";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ExportDialog({ open, onClose }: ExportDialogProps) {
  const { t } = useTranslation();
  const { selectedIds, skillQuery, getAllMatchingIds, exportSkillsToJson, exportCsv, exportReport } = useSkillStore();

  const [format, setFormat] = useState<ExportFormat>("csv");
  const [scope, setScope] = useState<"selected" | "filter" | "all">("selected");
  const [columns, setColumns] = useState<Set<string>>(new Set(DEFAULT_COLS));
  const [saving, setSaving] = useState(false);
  const [filterCount, setFilterCount] = useState(0);
  const [allCount, setAllCount] = useState(0);

  // Resolve counts for scope options
  useEffect(() => {
    if (!open) return;
    getAllMatchingIds(skillQuery).then((ids) => setFilterCount(ids.length)).catch(() => {});
    getAllMatchingIds({}).then((ids) => setAllCount(ids.length)).catch(() => {});
  }, [open, skillQuery, getAllMatchingIds]);

  const resolveIds = useCallback(async (): Promise<string[]> => {
    if (scope === "selected") return Array.from(selectedIds);
    if (scope === "filter") return getAllMatchingIds(skillQuery);
    return getAllMatchingIds({});
  }, [scope, selectedIds, skillQuery, getAllMatchingIds]);

  const toggleColumn = (col: string) => {
    setColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col); else next.add(col);
      return next;
    });
  };

  const selectAllCols = () => setColumns(new Set(ALL_COLUMNS));
  const resetCols = () => setColumns(new Set(DEFAULT_COLS));

  const handleExport = async () => {
    if (format === "csv" && columns.size === 0) return;
    setSaving(true);
    try {
      const ids = await resolveIds();
      if (ids.length === 0) { setSaving(false); return; }

      if (format === "json") {
        const json = await exportSkillsToJson(ids);
        await saveFile(json, "json", "skillhub-export.json");
      } else if (format === "csv") {
        const colArr = Array.from(columns);
        const csv = await exportCsv(ids, colArr);
        await saveFile(csv, "csv", "skillhub-export.csv");
      } else if (format === "report") {
        const md = await exportReport(ids);
        await saveFile(md, "md", "skillhub-report.md");
      } else if (format === "package") {
        // Ask for directory, then create subdir
        const colArr = Array.from(columns);
        const [csvData, mdData] = await Promise.all([
          exportCsv(ids, colArr),
          exportReport(ids),
        ]);
        await savePackage(csvData, mdData);
      }
    } catch (e) {
      console.error("Export failed", e);
    } finally {
      setSaving(false);
    }
  };

  const saveFile = async (content: string, _ext: string, defaultName: string) => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const extMap: Record<string, string> = { json: "json", csv: "csv", md: "md" };
      const ext = extMap[_ext] ?? _ext;
      const filePath = await save({
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
        defaultPath: defaultName,
      });
      if (filePath) await writeTextFile(filePath, content);
    } catch (_e) {
      // Fallback: download via Blob
      const mimeMap: Record<string, string> = { json: "application/json", csv: "text/csv", md: "text/markdown" };
      const blob = new Blob([content], { type: mimeMap[_ext] ?? "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = defaultName; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const savePackage = async (csvData: string, mdData: string) => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { mkdir, writeTextFile } = await import("@tauri-apps/plugin-fs");

      // Pick a directory
      const dirPath = await save({
        title: t("export.selectDir") ?? "Select directory",
      });
      if (!dirPath) return;

      // Create subdirectory
      const today = new Date().toISOString().slice(0, 10);
      let subDir = `${dirPath}\\skillhub-export-${today}`;
      let suffix = 0;
      // Check existence and append suffix
      const checkDir = async (p: string): Promise<boolean> => {
        try {
          const { stat } = await import("@tauri-apps/plugin-fs");
          await stat(p);
          return true;
        } catch { return false; }
      };
      while (await checkDir(subDir)) {
        suffix++;
        subDir = `${dirPath}\\skillhub-export-${today} (${suffix})`;
      }
      await mkdir(subDir, { recursive: true });

      const csvPath = `${subDir}\\export.csv`;
      const mdPath = `${subDir}\\report.md`;
      await Promise.all([
        writeTextFile(csvPath, csvData),
        writeTextFile(mdPath, mdData),
      ]);
    } catch (e) {
      console.error("Package export failed", e);
    }
  };

  if (!open) return null;

  const scopeOptions = [
    { key: "selected" as const, label: t("export.scopeSelected").replace("{count}", String(selectedIds.size)) },
    { key: "filter" as const, label: t("export.scopeFilter").replace("{count}", String(filterCount)) },
    { key: "all" as const, label: t("export.scopeAll").replace("{count}", String(allCount)) },
  ];

  const showColumns = format === "csv" || format === "package";
  const showReportPreview = format === "report";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-white/60 backdrop-blur-sm dark:bg-black/60" onClick={saving ? undefined : onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-[--color-border] bg-[--color-card] p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[--color-foreground]">{t("export.title")}</h2>
          <button onClick={onClose} disabled={saving} className="rounded-md p-1 text-[--color-muted-foreground] transition-colors hover:text-[--color-foreground]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-5">
          {/* Format Selection */}
          <div>
            <p className="mb-2 text-xs font-medium text-[--color-muted-foreground]">{t("export.formatLabel")}</p>
            <div className="grid grid-cols-2 gap-2">
              <FormatBtn icon={FileJson} label="JSON" active={format === "json"} onClick={() => setFormat("json")} group={t("export.dataGroup")} />
              <FormatBtn icon={FileSpreadsheet} label="CSV" active={format === "csv"} onClick={() => setFormat("csv")} group={t("export.dataGroup")} />
              <FormatBtn icon={FileText} label={t("export.report")} active={format === "report"} onClick={() => setFormat("report")} group={t("export.analysisGroup")} />
              <FormatBtn icon={FolderArchive} label={t("export.package")} active={format === "package"} onClick={() => setFormat("package")} group={t("export.comboGroup")} />
            </div>
          </div>

          {/* Scope */}
          <div>
            <p className="mb-2 text-xs font-medium text-[--color-muted-foreground]">{t("export.scopeLabel")}</p>
            <div className="space-y-1.5">
              {scopeOptions.map((opt) => (
                <label key={opt.key} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[--color-accent]">
                  <input type="radio" name="scope" checked={scope === opt.key} onChange={() => setScope(opt.key)} className="h-3.5 w-3.5 text-[--color-primary]" />
                  <span className="text-[--color-foreground]">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Column Customization */}
          {showColumns && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-[--color-muted-foreground]">{t("export.columns")}</p>
                <div className="flex gap-2">
                  <button onClick={selectAllCols} className="text-xs text-[--color-primary] hover:underline">{t("export.selectAll")}</button>
                  <button onClick={resetCols} className="text-xs text-[--color-muted-foreground] hover:underline">{t("export.reset")}</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ALL_COLUMNS.map((col) => (
                  <button
                    key={col}
                    onClick={() => toggleColumn(col)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      columns.has(col)
                        ? "border-[--color-primary] bg-[--color-primary] text-[--color-primary-foreground]"
                        : "border-[--color-border] text-[--color-muted-foreground] hover:border-[--color-primary]"
                    }`}
                  >
                    {columns.has(col) && <Check className="h-3 w-3" />}
                    {t(`export.columns.${col}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Report Preview Info */}
          {showReportPreview && (
            <div className="rounded-md border border-[--color-border] bg-[--color-background] p-3">
              <p className="mb-2 text-xs text-[--color-muted-foreground]">{t("export.reportDesc")}</p>
              <ul className="list-inside list-disc space-y-0.5 text-xs text-[--color-foreground]">
                <li>{t("export.reportItem1")}</li>
                <li>{t("export.reportItem2")}</li>
                <li>{t("export.reportItem3")}</li>
                <li>{t("export.reportItem4")}</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between border-t border-[--color-border] pt-4">
          <span className="text-xs text-[--color-muted-foreground]">
            {getSelectedInfo(format, scope, selectedIds.size, filterCount, allCount, columns.size)}
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-[--color-border] px-4 py-2 text-sm text-[--color-muted-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("export.cancel")}
            </button>
            <button
              onClick={handleExport}
              disabled={saving || (format === "csv" && columns.size === 0)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[--color-primary] px-4 py-2 text-sm font-medium text-[--color-primary-foreground] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {saving ? t("export.exporting") : t("export.export")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormatBtn({ icon: Icon, label, active, onClick, group }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
  group: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-md border px-3 py-2.5 text-xs transition-all ${
        active
          ? "border-[--color-primary] bg-[--color-primary]/10 text-[--color-primary] shadow-sm"
          : "border-[--color-border] text-[--color-muted-foreground] hover:border-[--color-primary]/40 hover:bg-[--color-accent]"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="font-medium">{label}</span>
      <span className="text-[10px] opacity-60">{group}</span>
    </button>
  );
}

function getSelectedInfo(format: ExportFormat, scope: string, selCount: number, filtCount: number, allCount: number, colCount: number): string {
  const scopeMap: Record<string, number> = { selected: selCount, filter: filtCount, all: allCount };
  const count = scopeMap[scope] ?? 0;
  const formatLabel = { json: "JSON", csv: "CSV", report: "MD", package: "PKG" }[format];
  if (format === "csv") return `${formatLabel} / ${count} skills / ${colCount} cols`;
  return `${formatLabel} / ${count} skills`;
}