import { useTranslation, setCurrentLang, type LangCode } from "@/i18n";
import { useSettingsStore } from "@/store/settingsStore";

/**
 * Web-only language & theme controls (the desktop Settings page is not
 * reachable from the Web build, which is read-only).
 */
export default function WebControls() {
  const { t } = useTranslation();
  const { settings, updateSetting, saveSettings } = useSettingsStore();

  const setLanguage = (language: string) => {
    setCurrentLang(language as LangCode);
    updateSetting("language", language);
    void saveSettings();
  };

  const setTheme = (theme_mode: string) => {
    updateSetting("theme_mode", theme_mode);
    void saveSettings();
  };

  const selectClass =
    "w-full rounded-md border border-[--color-border] bg-[--color-card] px-2 py-1.5 text-xs text-[--color-foreground] outline-none focus:border-[--color-primary]";

  return (
    <div className="flex flex-col gap-3 border-t border-[--color-border] p-3">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[--color-muted-foreground]">
          {t("web.language")}
        </span>
        <select
          value={settings.language}
          onChange={(e) => setLanguage(e.target.value)}
          className={selectClass}
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[--color-muted-foreground]">
          {t("web.theme")}
        </span>
        <select
          value={settings.theme_mode}
          onChange={(e) => setTheme(e.target.value)}
          className={selectClass}
        >
          <option value="system">{t("settings.system")}</option>
          <option value="light">{t("settings.light")}</option>
          <option value="dark">{t("settings.dark")}</option>
        </select>
      </label>
    </div>
  );
}
