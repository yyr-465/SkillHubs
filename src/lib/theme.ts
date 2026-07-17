export interface ThemePreset {
  id: string;
  primary: string;
  background: string;
  mode: "light" | "dark";
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "indigo", primary: "#6366f1", background: "#0f0f0f", mode: "dark" },
  { id: "ocean", primary: "#0ea5e9", background: "#082f49", mode: "dark" },
  { id: "forest", primary: "#16a34a", background: "#052e16", mode: "dark" },
  { id: "sunset", primary: "#f97316", background: "#431407", mode: "dark" },
  { id: "lavender", primary: "#8b5cf6", background: "#faf5ff", mode: "light" },
  { id: "rose", primary: "#e11d48", background: "#fff1f2", mode: "light" },
];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeHex(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return HEX_COLOR.test(normalized) ? normalized : null;
}

function channel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
}

function linear(value: number): number {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const value = normalizeHex(hex) ?? "#000000";
  return 0.2126 * linear(channel(value, 1)) + 0.7152 * linear(channel(value, 3)) + 0.0722 * linear(channel(value, 5));
}

export function foregroundFor(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? "#111827" : "#ffffff";
}

export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}
