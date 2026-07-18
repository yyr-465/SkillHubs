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
const SHORT_HEX_COLOR = /^#[0-9a-f]{3}$/i;
const RGB_COLOR = /^rgb\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)$/i;
const HSL_COLOR = /^hsl\(\s*([^,]+)\s*,\s*([^,]+)%\s*,\s*([^,]+)%\s*\)$/i;

function clamp(value: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, value));
}

function toHex(value: number): string {
  return Math.round(clamp(value)).toString(16).padStart(2, "0");
}

export function parseColor(value: string): string | null {
  const input = value.trim();
  if (SHORT_HEX_COLOR.test(input)) {
    return `#${input.slice(1).split("").map((part) => part + part).join("")}`.toLowerCase();
  }
  if (HEX_COLOR.test(input)) return input.toLowerCase();

  const rgb = input.match(RGB_COLOR);
  if (rgb) {
    const channels = rgb.slice(1).map((part) => {
      const trimmed = part.trim();
      if (trimmed.endsWith("%")) return Number.parseFloat(trimmed) * 2.55;
      return Number.parseFloat(trimmed);
    });
    if (channels.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)) {
      return `#${channels.map(toHex).join("")}`;
    }
  }

  const hsl = input.match(HSL_COLOR);
  if (hsl) {
    const hue = Number.parseFloat(hsl[1]);
    const saturation = Number.parseFloat(hsl[2]) / 100;
    const lightness = Number.parseFloat(hsl[3]) / 100;
    if ([hue, saturation, lightness].every(Number.isFinite) && saturation >= 0 && saturation <= 1 && lightness >= 0 && lightness <= 1) {
      const normalizedHue = ((hue % 360) + 360) % 360;
      const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
      const x = chroma * (1 - Math.abs((normalizedHue / 60) % 2 - 1));
      const match = lightness - chroma / 2;
      const [red, green, blue] = normalizedHue < 60 ? [chroma, x, 0] : normalizedHue < 120 ? [x, chroma, 0] : normalizedHue < 180 ? [0, chroma, x] : normalizedHue < 240 ? [0, x, chroma] : normalizedHue < 300 ? [x, 0, chroma] : [chroma, 0, x];
      return `#${[red, green, blue].map((channel) => toHex((channel + match) * 255)).join("")}`;
    }
  }
  return null;
}

export function normalizeHex(value: string): string | null {
  return parseColor(value);
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
  const background = normalizeHex(hex) ?? "#000000";
  return contrastRatio("#111827", background) >= contrastRatio("#ffffff", background) ? "#111827" : "#ffffff";
}

export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

export function hasReadableContrast(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 4.5;
}
