import { ThemeSchema, readableTextColor, type SiteTheme } from "@luvify/shared";

/**
 * Theme -> CSS.
 *
 * Only the *validated* theme reaches the stylesheet. `ThemeSchema` coerces every
 * colour through `normalizeHex`, clamps the radius, restricts the container width
 * to a fixed set and reduces both font names to the curated allow-list, so the
 * values interpolated here cannot break out of the declaration they live in.
 * We still re-parse defensively: a document restored from a snapshot or a
 * database row may predate a schema change.
 */
export interface ThemeCss {
  /** `data-*` hooks the stylesheet keys off. */
  attributes: { theme: "light" | "dark"; buttons: SiteTheme["buttonStyle"]; spacing: SiteTheme["sectionSpacing"] };
  /** Custom properties applied to the `data-lv-site` wrapper. */
  variables: Record<string, string>;
  /** Google Fonts href, or `undefined` when both fonts are system-safe. */
  fontHref: string | undefined;
  /** Ready-to-inject custom property block for the exported HTML. */
  css: string;
}

const FONT_STACK: Record<string, string> = {
  "Inter": "'Inter',system-ui,-apple-system,'Segoe UI',sans-serif",
  "Poppins": "'Poppins',system-ui,-apple-system,'Segoe UI',sans-serif",
  "Sora": "'Sora',system-ui,-apple-system,'Segoe UI',sans-serif",
  "Space Grotesk": "'Space Grotesk',system-ui,-apple-system,'Segoe UI',sans-serif",
  "Manrope": "'Manrope',system-ui,-apple-system,'Segoe UI',sans-serif",
  "Plus Jakarta Sans": "'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif",
  "Outfit": "'Outfit',system-ui,-apple-system,'Segoe UI',sans-serif",
  "Work Sans": "'Work Sans',system-ui,-apple-system,'Segoe UI',sans-serif",
  "DM Sans": "'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif",
  "Nunito Sans": "'Nunito Sans',system-ui,-apple-system,'Segoe UI',sans-serif",
  "Playfair Display": "'Playfair Display',Georgia,serif",
  "DM Serif Display": "'DM Serif Display',Georgia,serif",
  "Libre Baskerville": "'Libre Baskerville',Georgia,serif",
  "Lora": "'Lora',Georgia,serif",
  "Fraunces": "'Fraunces',Georgia,serif",
  "Cormorant Garamond": "'Cormorant Garamond',Georgia,serif",
  "Crimson Pro": "'Crimson Pro',Georgia,serif",
  "IBM Plex Sans": "'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif",
  "Source Sans 3": "'Source Sans 3',system-ui,-apple-system,'Segoe UI',sans-serif",
  "Archivo": "'Archivo',system-ui,-apple-system,'Segoe UI',sans-serif",
};

function stack(font: string): string {
  return FONT_STACK[font] ?? "'Inter',system-ui,-apple-system,'Segoe UI',sans-serif";
}

/** Parses a possibly-unvalidated theme, falling back to the defaults. */
export function normalizeTheme(theme: unknown): SiteTheme {
  const parsed = ThemeSchema.safeParse(theme ?? {});
  return parsed.success ? parsed.data : ThemeSchema.parse({});
}

export function themeFontHref(theme: SiteTheme): string | undefined {
  const families = [...new Set([theme.fonts.heading, theme.fonts.body])];
  const familiesCss = families
    .map((font) => `family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${familiesCss}&display=swap`;
}

export function themeVariables(theme: SiteTheme): Record<string, string> {
  const colors = theme.colors;
  return {
    "--lv-primary": colors.primary,
    "--lv-primary-contrast": readableTextColor(colors.primary),
    "--lv-secondary": colors.secondary,
    "--lv-accent": colors.accent,
    "--lv-bg": colors.background,
    "--lv-surface": colors.surface,
    "--lv-fg": colors.foreground,
    "--lv-muted": colors.muted,
    "--lv-border": colors.border,
    "--lv-radius": `${theme.radius}px`,
    "--lv-container": `${theme.containerWidth}px`,
    "--lv-heading": stack(theme.fonts.heading),
    "--lv-body": stack(theme.fonts.body),
  };
}

/** The `:root`-scoped custom property block, safe to inline into `<style>`. */
export function themeVariablesCss(theme: SiteTheme): string {
  const declarations = Object.entries(themeVariables(theme))
    .map(([name, value]) => `${name}:${value}`)
    .join(";");
  return `[data-lv-site]{${declarations}}`;
}

export function themeCss(theme: SiteTheme, options: { webFonts?: boolean } = {}): ThemeCss {
  const variables = themeVariables(theme);
  return {
    attributes: {
      theme: theme.dark ? "dark" : "light",
      buttons: theme.buttonStyle,
      spacing: theme.sectionSpacing,
    },
    variables,
    fontHref: options.webFonts === false ? undefined : themeFontHref(theme),
    css: themeVariablesCss(theme),
  };
}
