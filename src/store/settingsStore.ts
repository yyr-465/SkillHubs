import { create } from "zustand";
import { invoke } from "@/lib/runtime";
import type { LangCode } from "@/i18n";
import { setCurrentLang } from "@/i18n";
import { contrastRatio, foregroundFor, normalizeHex } from "@/lib/theme";

// ── Types ───────────────────────────────────────────────────────

export interface AppSettings {
  api_key: string;
  language: string;
  theme_mode: string;
  custom_primary: string;
  custom_background: string;
  minimize_to_tray: boolean;
  skill_directory: string | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  api_key: "",
  language: "en",
  theme_mode: "system",
  custom_primary: "#6366f1",
  custom_background: "#0f0f0f",
  minimize_to_tray: true,
  skill_directory: null,
};

// ── Store ───────────────────────────────────────────────────────

interface SettingsStore {
  settings: AppSettings;
  loaded: boolean;
  savedMessage: boolean;
  themeError: string | null;
  savedSettings: AppSettings;

  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  saveSettings: () => Promise<void>;
  cancelThemeChanges: () => void;
  clearSavedMessage: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  savedMessage: false,
  themeError: null,
  savedSettings: DEFAULT_SETTINGS,

  loadSettings: async () => {
    try {
      const settings = await invoke<AppSettings>("load_settings");
      set({ settings, savedSettings: settings, loaded: true, themeError: null });
      setCurrentLang(settings.language as LangCode);
      applyTheme(settings);
    } catch {
      set({ loaded: true });
    }
  },

  updateSetting: (key, value) => {
    if ((key === "custom_primary" || key === "custom_background") && typeof value === "string" && !normalizeHex(value)) {
      set({ themeError: "Invalid color. Fallback applied." });
      return;
    }
    set((state) => {
      const settings = { ...state.settings, [key]: value };
      applyTheme(settings);
      return { settings, themeError: null };
    });
  },

  saveSettings: async () => {
    const { settings } = get();
    const primary = normalizeHex(settings.custom_primary);
    const background = normalizeHex(settings.custom_background);
    if (settings.theme_mode === "custom" && primary && background && contrastRatio(foregroundFor(primary), primary) < 4.5) {
      set({ themeError: "Invalid color contrast. Choose a darker or lighter primary color." });
      return;
    }
    try {
      await invoke<AppSettings>("save_settings", { settings });
      setCurrentLang(settings.language as LangCode);
      applyTheme(settings);
      set({ savedMessage: true, savedSettings: settings, themeError: null });
    } catch (e) {
      console.error("Failed to save settings", e);
    }
  },

  clearSavedMessage: () => set({ savedMessage: false }),
  cancelThemeChanges: () => {
    const { savedSettings } = get();
    applyTheme(savedSettings);
    set({ settings: savedSettings, themeError: null });
  },
}));

// ── Theme application ────────────────────────────────────────────

function applyTheme(settings: AppSettings) {
  const root = document.documentElement;

  let effective: string;
  if (settings.theme_mode === "system") {
    effective = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else {
    effective = settings.theme_mode;
  }

  if (effective === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  const custom = settings.theme_mode === "custom";
  const background = normalizeHex(settings.custom_background) ?? (effective === "dark" ? "#0f0f0f" : "#ffffff");
  const primary = normalizeHex(settings.custom_primary) ?? "#6366f1";
  const primaryForeground = foregroundFor(primary);
  const backgroundForeground = foregroundFor(background);
  if (custom) {
    root.style.setProperty("--skill-bg", background);
    root.style.setProperty("--skill-fg", backgroundForeground);
    root.style.setProperty("--skill-card", effective === "dark" ? "#1a1a1a" : "#f5f5f5");
    root.style.setProperty("--skill-card-fg", backgroundForeground);
    root.style.setProperty("--skill-primary", primary);
    root.style.setProperty("--skill-primary-fg", primaryForeground);
    root.style.setProperty("--skill-border", backgroundForeground === "#ffffff" ? "#d4d4d4" : "#52525b");
    root.style.setProperty("--skill-input", backgroundForeground === "#ffffff" ? "#d4d4d4" : "#52525b");
    root.style.setProperty("--skill-muted", backgroundForeground === "#ffffff" ? "#e5e5e5" : "#27272a");
    root.style.setProperty("--skill-muted-fg", backgroundForeground === "#ffffff" ? "#4b5563" : "#d4d4d8");
    root.style.setProperty("--skill-accent", primary);
    root.style.setProperty("--skill-accent-fg", primaryForeground);
    root.style.setProperty("--skill-ring", primary);
    root.style.setProperty("--skill-destructive", "#b91c1c");
    root.style.setProperty("--skill-destructive-fg", "#ffffff");
    root.style.setProperty("--skill-secondary", root.style.getPropertyValue("--skill-muted"));
    root.style.setProperty("--skill-secondary-fg", root.style.getPropertyValue("--skill-muted-fg"));
    root.style.setProperty("--skill-popover", root.style.getPropertyValue("--skill-card"));
    root.style.setProperty("--skill-popover-fg", root.style.getPropertyValue("--skill-card-fg"));
  } else {
    ["--skill-bg", "--skill-fg", "--skill-card", "--skill-card-fg", "--skill-primary", "--skill-primary-fg", "--skill-accent", "--skill-accent-fg", "--skill-ring", "--skill-border", "--skill-input", "--skill-muted", "--skill-muted-fg", "--skill-destructive", "--skill-destructive-fg", "--skill-secondary", "--skill-secondary-fg", "--skill-popover", "--skill-popover-fg"].forEach((name) => root.style.removeProperty(name));
  }
}

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    const s = useSettingsStore.getState().settings;
    if (s.theme_mode === "system") {
      applyTheme(s);
    }
  });

