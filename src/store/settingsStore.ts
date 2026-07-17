import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { LangCode } from "@/i18n";
import { setCurrentLang } from "@/i18n";
import { foregroundFor, normalizeHex } from "@/lib/theme";

// ── Types ───────────────────────────────────────────────────────

export interface AppSettings {
  api_key: string;
  language: string;
  theme_mode: string;
  custom_primary: string;
  custom_background: string;
  minimize_to_tray: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  api_key: "",
  language: "en",
  theme_mode: "system",
  custom_primary: "#6366f1",
  custom_background: "#0f0f0f",
  minimize_to_tray: true,
};

// ── Store ───────────────────────────────────────────────────────

interface SettingsStore {
  settings: AppSettings;
  loaded: boolean;
  savedMessage: boolean;

  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  saveSettings: () => Promise<void>;
  clearSavedMessage: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  savedMessage: false,

  loadSettings: async () => {
    try {
      const settings = await invoke<AppSettings>("load_settings");
      set({ settings, loaded: true });
      setCurrentLang(settings.language as LangCode);
      applyTheme(settings);
    } catch {
      set({ loaded: true });
    }
  },

  updateSetting: (key, value) => {
    set((state) => {
      const settings = { ...state.settings, [key]: value };
      applyTheme(settings);
      return { settings };
    });
  },

  saveSettings: async () => {
    const { settings } = get();
    try {
      await invoke<AppSettings>("save_settings", { settings });
      setCurrentLang(settings.language as LangCode);
      applyTheme(settings);
      set({ savedMessage: true });
    } catch (e) {
      console.error("Failed to save settings", e);
    }
  },

  clearSavedMessage: () => set({ savedMessage: false }),
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
  if (custom) {
    root.style.setProperty("--skill-bg", background);
    root.style.setProperty("--skill-fg", foregroundFor(background));
    root.style.setProperty("--skill-card", effective === "dark" ? "#1a1a1a" : "#f5f5f5");
    root.style.setProperty("--skill-card-fg", foregroundFor(background));
    root.style.setProperty("--skill-primary", primary);
    root.style.setProperty("--skill-primary-fg", foregroundFor(primary));
    root.style.setProperty("--skill-accent", primary);
    root.style.setProperty("--skill-accent-fg", foregroundFor(primary));
    root.style.setProperty("--skill-ring", primary);
  } else {
    ["--skill-bg", "--skill-fg", "--skill-card", "--skill-card-fg", "--skill-primary", "--skill-primary-fg", "--skill-accent", "--skill-accent-fg", "--skill-ring"].forEach((name) => root.style.removeProperty(name));
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

