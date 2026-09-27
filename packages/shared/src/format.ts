/** Small, dependency-free formatting + color helpers shared by every package. */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value.trim());
}

/** Normalises "#fff"/"fff"/"#FFFFFF" to "#ffffff"; returns fallback when invalid. */
export function normalizeHex(value: string | undefined | null, fallback = "#111827"): string {
  if (!isHexColor(value)) return fallback;
  const raw = value.trim().toLowerCase();
  return raw.length === 4 ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}` : raw;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[r, g, b].map((channel) => clamp(channel).toString(16).padStart(2, "0")).join("")}`;
}

/** Mixes `amount` (0..1) of `mixHex` into `hex` - used for tints/shades of brand colors. */
export function mix(hex: string, mixHex: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(mixHex);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
}

export const lighten = (hex: string, amount: number): string => mix(hex, "#ffffff", amount);
export const darken = (hex: string, amount: number): string => mix(hex, "#000000", amount);

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Picks dark or light text for the given background (WCAG-ish 0.5 luminance split). */
export function readableTextColor(backgroundHex: string): string {
  return relativeLuminance(backgroundHex) > 0.5 ? "#0b1220" : "#ffffff";
}

export function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** "$12.50" | "12,50 EUR" | "5000" -> minor units (cents). */
export function parsePriceToCents(value: unknown, fallbackCents = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  const parsed = parseNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : fallbackCents;
}

export function formatCurrency(cents: number, currency = "USD", locale = "en-US"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDate(value: string | number | Date, locale = "en-US"): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatRelativeTime(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(seconds) >= secondsInUnit || unit === "second") {
      return formatter.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return "just now";
}

export function slugify(input: string, fallback = "project"): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  return slug || fallback;
}

export function titleCase(input: string): string {
  return input
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function truncate(input: string, max = 140): string {
  const trimmed = input.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export function initials(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export function unique<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items));
}

/** Deterministic pseudo-random pick so mock generation stays reproducible. */
export function pickStable<T>(items: readonly T[], seed: string, offset = 0): T | undefined {
  if (items.length === 0) return undefined;
  let hash = offset;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 100_000;
  return items[hash % items.length];
}

