import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { useSettingsStore } from "@/store/settingsStore";
import { useSkillStore } from "@/store/skillStore";
import { Check, Download, Key, Upload, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { THEME_PRESETS, normalizeHex } from "@/lib/theme";
import { checkForUpdate, downloadUpdate, getCurrentVersion, installUpdate, type UpdateState } from "@/lib/updates";

interface RestorePreview {
  format: string;
  version: number;
  created_at: string;
  app_version: string;
  skills: number;
  tags: number;
  skill_tags: number;
  favorites: number;
  search_history: number;
  recent_views: number;
  categorization_history: number;
  execution_audit: number;
  has_settings: boolean;
  warnings: string[];
}

interface RestoreSummary {
  skills: number;
  tags: number;
  skill_tags: number;
  search_history: number;
  recent_views: number;
  categorization_history: number;
  execution_audit: number;
  settings_restored: boolean;
  warnings: string[];
}

interface DatabaseIntegrity {
  status: string;
  detail: string;
  schema_version: number;
  expected_version: number;
}

interface DataDirectoryInfo {
  data_directory: string;
  database_file: string;
}

export default function Settings() {
  const { t } = useTranslation();
  const {
    settings,
    loaded,
    savedMessage,
    themeError,
    loadSettings,
    updateSetting,
    saveSettings,
    cancelThemeChanges,
    clearSavedMessage,
  } = useSettingsStore();
  const { exportSkillsToJson, importSkillsFromJson, fetchStats, fetchSkills, fetchAllTags, fetchFilters } = useSkillStore();

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState("0.1.0");
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [updateProgress, setUpdateProgress] = useState<{ downloaded: number; total?: number }>({ downloaded: 0 });
  const [diagnostics, setDiagnostics] = useState<Array<{ id: string; status: string; detail: string }>>([]);
  const [diagnosing, setDiagnosing] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreJson, setRestoreJson] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<DatabaseIntegrity | null>(null);
  const [dataDirInfo, setDataDirInfo] = useState<DataDirectoryInfo | null>(null);
  const msgTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadAttemptRef = useRef(0);

  const getDiagnosticTone = (status: string) => {
    if (status === "ok") return { label: t("settings.diagnosticsOk"), className: "text-green-600" };
    if (status === "info") return { label: t("settings.diagnosticsInfo"), className: "text-[--color-muted-foreground]" };
    return { label: t("settings.diagnosticsWarning"), className: "text-amber-600" };
  };

  useEffect(() => {
    if (!loaded) loadSettings();
  }, [loaded, loadSettings]);

  useEffect(() => {
    if (savedMessage) {
      const id = setTimeout(clearSavedMessage, 3000);
      return () => clearTimeout(id);
    }
  }, [savedMessage, clearSavedMessage]);

  // Auto-clear data messages
  useEffect(() => {
    if (dataMessage) {
      if (msgTimeoutRef.current) clearTimeout(msgTimeoutRef.current);
      msgTimeoutRef.current = setTimeout(() => setDataMessage(null), 4000);
    }
    return () => {
      if (msgTimeoutRef.current) clearTimeout(msgTimeoutRef.current);
    };
  }, [dataMessage]);

  useEffect(() => {
    getCurrentVersion().then(setCurrentVersion);
    invoke<DataDirectoryInfo>("get_data_directory").then(setDataDirInfo).catch(() => {});
  }, []);

  const getUpdateErrorMessage = (state: UpdateState) => {
    switch (state.errorKind) {
      case "network": return t("settings.updateNetworkError");
      case "signature": return t("settings.updateSignatureError");
      case "download_interrupted": return t("settings.updateDownloadInterrupted");
      case "cancelled": return t("settings.updateCancelled");
      default: return t("settings.updateUnknownError");
    }
  };

  const handleCheckForUpdates = async () => {
    setUpdateChecking(true);
    const result = await checkForUpdate();
    setUpdateState(result);
    setUpdateMessage(result.status === "available"
      ? `${t("settings.currentVersion")}: ${result.availableVersion ?? ""}`
      : result.status === "not_available" ? t("settings.updateUnavailable") : getUpdateErrorMessage(result));
    setUpdateChecking(false);
  };

  const handleDiagnostics = async () => {
    setDiagnosing(true);
    try {
      const checks = await invoke<Array<{ id: string; status: string; detail: string }>>("get_environment_diagnostics");
      const update = await checkForUpdate();
      checks.push({ id: "updater", status: update.status === "failed" ? "warning" : "ok", detail: update.status === "failed" ? getUpdateErrorMessage(update) : t("settings.updaterReachable") });
      setDiagnostics(checks);
    }
    catch { setDiagnostics([{ id: "diagnostics", status: "warning", detail: t("settings.diagnosticsUnavailable") }]); }
    finally { setDiagnosing(false); }
  };

  const handleDownloadUpdate = async () => {
    if (!updateState) return;
    const attempt = ++downloadAttemptRef.current;
    setUpdateState({ ...updateState, status: "downloading" });
    const result = await downloadUpdate(updateState, (downloaded, total) => {
      if (attempt === downloadAttemptRef.current) setUpdateProgress({ downloaded, total });
    });
    if (attempt !== downloadAttemptRef.current) {
      await result.update?.close().catch(() => undefined);
      return;
    }
    setUpdateState(result);
    setUpdateMessage(result.status === "ready_to_install"
      ? "Update downloaded. Restart is required to install it."
      : getUpdateErrorMessage(result));
  };

  const handleCancelDownload = async () => {
    if (updateState?.status !== "downloading") return;
    downloadAttemptRef.current += 1;
    await updateState.update?.close().catch(() => undefined);
    const cancelledState: UpdateState = { ...updateState, status: "cancelled", errorKind: "cancelled" };
    setUpdateState(cancelledState);
    setUpdateMessage(getUpdateErrorMessage(cancelledState));
  };

  const handleInstallUpdate = async () => {
    if (!updateState) return;
    setUpdateState({ ...updateState, status: "installing" });
    const result = await installUpdate(updateState);
    setUpdateState(result);
    if (result.status === "failed") setUpdateMessage(getUpdateErrorMessage(result));
  };

  const handleBackup = async () => {
    setBackupBusy(true);
    setBackupMessage(null);
    try {
      const json = await invoke<string>("backup_data");
      const date = new Date().toISOString().slice(0, 10);
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const filePath = await save({
          filters: [{ name: t("dialog.jsonFilter"), extensions: ["json"] }],
          defaultPath: `skillhub-backup-${date}.json`,
        });
        if (filePath) {
          await writeTextFile(filePath, json);
          setBackupMessage(t("backup.backupSuccess").replace("{file}", filePath));
        }
      } catch {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `skillhub-backup-${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setBackupMessage(t("backup.backupSuccess").replace("{file}", a.download));
      }
    } catch (e) {
      setBackupMessage(t("backup.backupError").replace("{error}", String(e)));
    }
    setBackupBusy(false);
  };

  const handleChooseBackupFile = async () => {
    setRestoreBusy(true);
    setBackupMessage(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const file = await open({ multiple: false, filters: [{ name: t("dialog.jsonFilter"), extensions: ["json"] }] });
      if (!file) { setRestoreBusy(false); return; }
      const content = await readTextFile(file as string);
      const preview = await invoke<RestorePreview>("preview_restore", { jsonStr: content });
      setRestorePreview(preview);
      setRestoreJson(content);
    } catch (e) {
      setBackupMessage(t("backup.restoreError").replace("{error}", String(e)));
    }
    setRestoreBusy(false);
  };

  const handleConfirmRestore = async () => {
    if (!restoreJson) return;
    setRestoreBusy(true);
    try {
      const summary = await invoke<RestoreSummary>("restore_data", { jsonStr: restoreJson });
      const warnings = summary.warnings.length > 0 ? " " + summary.warnings.join(" ") : "";
      setBackupMessage(
        t("backup.restoreSuccess")
          .replace("{skills}", String(summary.skills))
          .replace("{tags}", String(summary.tags)) + warnings
      );
      setRestorePreview(null);
      setRestoreJson(null);
      loadSettings();
      fetchStats();
      fetchSkills();
      fetchAllTags();
      fetchFilters();
    } catch (e) {
      setBackupMessage(t("backup.restoreError").replace("{error}", String(e)));
    }
    setRestoreBusy(false);
  };

  const handleVerifyDatabase = async () => {
    setVerifyBusy(true);
    try {
      const result = await invoke<DatabaseIntegrity>("verify_database");
      setVerifyResult(result);
    } catch (e) {
      setVerifyResult({ status: "unavailable", detail: String(e), schema_version: 0, expected_version: 0 });
    }
    setVerifyBusy(false);
  };

  const handleExportAll = async () => {
    setExporting(true);
    setDataMessage(null);
    try {
      const json = await exportSkillsToJson([]);
      // Try Tauri native save dialog first
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        const filePath = await save({
          filters: [{ name: t("dialog.jsonFilter"), extensions: ["json"] }],
          defaultPath: `skillhub-all-${Date.now()}.json`,
        });
        if (filePath) {
          await writeTextFile(filePath, json);
          setDataMessage(t("dialog.exportSuccess").replace("{count}", "all").replace("{file}", filePath));
        }
      } catch (_e) {
        // Fallback: download via Blob
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `skillhub-all-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setDataMessage("Exported successfully.");
      }
    } catch (e) {
      setDataMessage(t("dialog.exportError").replace("{error}", String(e)));
    }
    setExporting(false);
  };

  const handleImport = async () => {
    setImporting(true);
    setDataMessage(null);
    try {
      // Try Tauri native dialog first
      try {
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
        setDataMessage(
          t("dialog.importSuccess").replace("{count}", String(result.success_count)) +
            (result.errors.length > 0 ? " Errors: " + result.errors.join("; ") : "")
        );
        fetchStats();
        setImporting(false);
        return;
      } catch (_e) {
        // Fallback to <input type="file">
      }

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
      setDataMessage(
        `Imported ${result.success_count} skills.${result.errors.length > 0 ? " Errors: " + result.errors.join("; ") : ""}`
      );
      fetchStats();
    } catch (e) {
      setDataMessage(`Import failed: ${e}`);
    }
    setImporting(false);
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-[--color-muted-foreground]">
          {t("settings.subtitle")}
        </p>
      </div>

      {/* Language */}
      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-6">
        <h2 className="mb-3 text-sm font-medium">{t("settings.language")}</h2>
        <select
          value={settings.language}
          onChange={(e) => updateSetting("language", e.target.value)}
          className="w-full rounded-md border border-[--color-input] bg-[--color-background] px-3 py-2 text-sm text-[--color-foreground] outline-none focus:ring-2 focus:ring-[--color-ring] dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </div>

      {/* Theme */}
      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-6">
        <h2 className="mb-3 text-sm font-medium">{t("settings.theme")}</h2>
        <div className="flex flex-wrap gap-3">
          {(["system", "light", "dark", "custom"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => updateSetting("theme_mode", mode)}
              className={`relative flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ${
                settings.theme_mode === mode
                  ? "border-[--color-primary] bg-[--color-primary]/10 text-[--color-primary]"
                  : "border-[--color-border] text-[--color-muted-foreground] hover:bg-[--color-accent]"
              }`}
            >
              {settings.theme_mode === mode && <Check className="h-3.5 w-3.5" />}
              {t(`settings.${mode}`)}
            </button>
          ))}
        </div>
        {settings.theme_mode === "custom" && (
          <div className="mt-5 space-y-4 border-t border-[--color-border] pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {(["custom_primary", "custom_background"] as const).map((key) => (
                <label key={key} className="flex items-center justify-between gap-3 text-sm">
                  <span>{t(`settings.${key}`)}</span>
                  <input type="color" value={normalizeHex(settings[key]) ?? "#6366f1"} onChange={(e) => updateSetting(key, e.target.value)} className="h-9 w-14 cursor-pointer rounded border border-[--color-border] bg-transparent p-1" />
                </label>
              ))}
            </div>
            {themeError && <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{themeError}</p>}
            <div>
              <p className="mb-2 text-xs text-[--color-muted-foreground]">{t("settings.presets")}</p>
              <div className="flex flex-wrap gap-2">
                {THEME_PRESETS.map((preset) => (
                  <button key={preset.id} onClick={() => { updateSetting("theme_mode", "custom"); updateSetting("custom_primary", preset.primary); updateSetting("custom_background", preset.background); }} className="flex items-center gap-2 rounded-md border border-[--color-border] px-3 py-2 text-xs hover:bg-[--color-accent]">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.primary }} />{t(`settings.preset_${preset.id}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-6">
        <div className="flex items-center justify-between gap-4">
          <div><h2 className="text-sm font-medium">{t("settings.environmentDiagnostics")}</h2><p className="mt-1 text-xs text-[--color-muted-foreground]">{t("settings.environmentDiagnosticsDesc")}</p></div>
          <button onClick={handleDiagnostics} disabled={diagnosing} className="rounded-md border border-[--color-border] px-3 py-2 text-sm hover:bg-[--color-accent] disabled:opacity-50">{diagnosing ? t("settings.diagnosticsChecking") : t("settings.runDiagnostics")}</button>
        </div>
        {diagnostics.length > 0 && <div className="mt-4 space-y-2">{diagnostics.map((item) => { const tone = getDiagnosticTone(item.status); return <div key={item.id} className="flex items-start justify-between gap-3 rounded-md bg-[--color-muted] px-3 py-2 text-xs"><span className={tone.className}>{tone.label}</span><span className="text-right text-[--color-muted-foreground]">{item.detail}</span></div>; })}</div>}
      </div>

      {/* API Key */}
      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Key className="h-4 w-4" />
          {t("settings.apiKey")}
        </h2>
        <input
          type="password"
          value={settings.api_key}
          onChange={(e) => updateSetting("api_key", e.target.value)}
          placeholder={t("settings.apiKeyPlaceholder")}
          className="w-full rounded-md border border-[--color-input] bg-[--color-background] px-3 py-2 text-sm text-[--color-foreground] outline-none placeholder:text-[--color-muted-foreground] focus:ring-2 focus:ring-[--color-ring]"
        />
      </div>

      {/* Updates */}
      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-6">
        <h2 className="mb-2 text-sm font-medium">{t("settings.updates")}</h2>
        <p className="mb-4 text-xs text-[--color-muted-foreground]">
          {t("settings.currentVersion")}: <span className="font-mono">{currentVersion}</span>
        </p>
        {updateMessage && <p className="mb-3 rounded-md bg-[--color-muted] px-3 py-2 text-xs text-[--color-muted-foreground]">{updateMessage}</p>}
        {updateState?.status === "available" && (
          <button onClick={handleDownloadUpdate} className="mr-2 rounded-md border border-[--color-border] px-4 py-2 text-sm hover:bg-[--color-accent]">Download update</button>
        )}
        {updateState?.status === "downloading" && (
          <div className="mb-3">
            <p className="mb-2 text-xs text-[--color-muted-foreground]">Downloading: {Math.round(updateProgress.downloaded / 1024 / 1024)}MB{updateProgress.total ? ` / ${Math.round(updateProgress.total / 1024 / 1024)}MB` : ""}</p>
            <button onClick={handleCancelDownload} className="rounded-md border border-[--color-border] px-4 py-2 text-sm hover:bg-[--color-accent]">{t("settings.cancelUpdate")}</button>
          </div>
        )}
        {updateState?.status === "ready_to_install" && (
          <button onClick={handleInstallUpdate} className="mr-2 rounded-md border border-[--color-border] px-4 py-2 text-sm hover:bg-[--color-accent]">Install and restart</button>
        )}
        <button onClick={handleCheckForUpdates} disabled={updateChecking} className="inline-flex items-center gap-2 rounded-md border border-[--color-border] bg-[--color-background] px-4 py-2 text-sm text-[--color-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50">
          {updateChecking && <Loader2 className="h-4 w-4 animate-spin" />}
          {updateState?.status === "failed" || updateState?.status === "cancelled"
            ? t("settings.retryUpdate")
            : t("settings.checkForUpdates")}
        </button>
      </div>

      {/* System tray */}
      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-6">
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>
            <span className="block font-medium">{t("settings.minimizeToTray")}</span>
            <span className="mt-1 block text-xs text-[--color-muted-foreground]">{t("settings.minimizeToTrayDesc")}</span>
          </span>
          <input type="checkbox" checked={settings.minimize_to_tray} onChange={(e) => updateSetting("minimize_to_tray", e.target.checked)} />
        </label>
      </div>

      {/* Data Management */}
      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-6">
        <h2 className="mb-3 text-sm font-medium">{t("settings.dataManagement")}</h2>
        <p className="mb-4 text-xs text-[--color-muted-foreground]">
          {t("settings.dataManagementDesc")}
        </p>
        {dataMessage && (
          <div className="mb-3 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400">
            {dataMessage}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportAll}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-md border border-[--color-border] bg-[--color-background] px-4 py-2 text-sm text-[--color-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t("dashboard.exportAll")}
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="inline-flex items-center gap-2 rounded-md border border-[--color-border] bg-[--color-background] px-4 py-2 text-sm text-[--color-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {t("dashboard.import")}
          </button>
        </div>
      </div>

      {/* Backup & Restore */}
      <div className="rounded-lg border border-[--color-border] bg-[--color-card] p-6">
        <h2 className="mb-3 text-sm font-medium">{t("backup.title")}</h2>
        <p className="mb-2 text-xs text-[--color-muted-foreground]">{t("backup.desc")}</p>
        <p className="mb-4 text-xs text-[--color-muted-foreground]">{t("backup.noSecrets")}</p>

        {dataDirInfo && (
          <p className="mb-3 break-all rounded-md bg-[--color-muted] px-3 py-2 text-xs text-[--color-muted-foreground]">
            {t("backup.dataDirectory")}: <span className="font-mono">{dataDirInfo.data_directory}</span>
          </p>
        )}

        {backupMessage && (
          <div className="mb-3 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400">{backupMessage}</div>
        )}

        {verifyResult && (
          <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${verifyResult.status === "ok" ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"}`}>
            {verifyResult.status === "ok" ? t("backup.databaseOk") : t("backup.databaseProblem").replace("{detail}", verifyResult.detail)}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleBackup}
            disabled={backupBusy || restoreBusy}
            className="inline-flex items-center gap-2 rounded-md border border-[--color-border] bg-[--color-background] px-4 py-2 text-sm text-[--color-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {backupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {backupBusy ? t("backup.creating") : t("backup.createBackup")}
          </button>
          <button
            onClick={handleChooseBackupFile}
            disabled={backupBusy || restoreBusy}
            className="inline-flex items-center gap-2 rounded-md border border-[--color-border] bg-[--color-background] px-4 py-2 text-sm text-[--color-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {restoreBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("backup.restore")}
          </button>
          <button
            onClick={handleVerifyDatabase}
            disabled={verifyBusy}
            className="inline-flex items-center gap-2 rounded-md border border-[--color-border] bg-[--color-background] px-4 py-2 text-sm text-[--color-foreground] transition-colors hover:bg-[--color-accent] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {verifyBusy ? t("backup.verifying") : t("backup.verifyDatabase")}
          </button>
        </div>
      </div>

      {/* Restore preview modal */}
      {restorePreview && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm dark:bg-black/60" onClick={() => setRestorePreview(null)} />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col rounded-lg border border-[--color-border] bg-[--color-card] p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold text-[--color-foreground]">{t("backup.previewTitle")}</h3>
            <p className="mb-4 text-xs text-[--color-muted-foreground]">
              {t("backup.previewFormat")}: {restorePreview.format} · {t("backup.previewVersion")}: {restorePreview.version} · {t("backup.previewAppVersion")}: {restorePreview.app_version}
            </p>
            <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <PreviewRow label={t("backup.previewSkills")} value={restorePreview.skills} />
              <PreviewRow label={t("backup.previewTags")} value={restorePreview.tags} />
              <PreviewRow label={t("backup.previewAssociations")} value={restorePreview.skill_tags} />
              <PreviewRow label={t("backup.previewFavorites")} value={restorePreview.favorites} />
              <PreviewRow label={t("backup.previewSettings")} value={restorePreview.has_settings ? 1 : 0} />
              <PreviewRow label={t("backup.previewSearchHistory")} value={restorePreview.search_history} />
              <PreviewRow label={t("backup.previewRecentViews")} value={restorePreview.recent_views} />
              <PreviewRow label={t("backup.previewCategorization")} value={restorePreview.categorization_history} />
              <PreviewRow label={t("backup.previewAudit")} value={restorePreview.execution_audit} />
            </div>
            {restorePreview.warnings.length > 0 && (
              <div className="mb-4 max-h-32 overflow-y-auto rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                {restorePreview.warnings.map((w, i) => (
                  <p key={i}>{t("backup.previewWarning")}: {w}</p>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-3 border-t border-[--color-border] pt-4">
              <button onClick={() => setRestorePreview(null)} disabled={restoreBusy} className="rounded-md border border-[--color-border] px-4 py-2 text-sm text-[--color-muted-foreground] hover:bg-[--color-accent] disabled:opacity-50">
                {t("backup.cancel")}
              </button>
              <button onClick={handleConfirmRestore} disabled={restoreBusy} className="inline-flex items-center gap-1.5 rounded-md bg-[--color-primary] px-4 py-2 text-sm font-medium text-[--color-primary-foreground] hover:opacity-90 disabled:opacity-50">
                {restoreBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("backup.confirmRestore")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save */}
      <div className="flex items-center justify-between">
        <button
          onClick={cancelThemeChanges}
          className="rounded-lg border border-[--color-border] px-5 py-2 text-sm text-[--color-foreground] transition-colors hover:bg-[--color-accent]"
        >
          {t("skillEditor.cancel")}
        </button>
        <button
          onClick={saveSettings}
          className="inline-flex items-center gap-2 rounded-lg bg-[--color-primary] px-5 py-2 text-sm font-medium text-[--color-primary-foreground] transition-opacity hover:opacity-90"
        >
          {t("settings.save")}
        </button>
        {savedMessage && (
          <span className="text-sm text-green-500">{t("settings.saved")}</span>
        )}
      </div>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[--color-muted-foreground]">{label}</span>
      <span className="font-medium text-[--color-foreground]">{value}</span>
    </div>
  );
}
