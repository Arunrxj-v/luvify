import { renderToStaticMarkup } from "react-dom/server";
import { slugify, type SiteDocument, type SitePage } from "@luvify/shared";
import type { ExportResponseDto, PreviewResponseDto } from "@luvify/shared";
import { PageView } from "./render";
import { SITE_CSS } from "./styles";
import { normalizeTheme, themeVariablesCss } from "./theme";
import { escapeHtml, safeExternalUrl, safeRelativeUrl } from "./html";
import { normalizePath } from "./paths";

// Re-exported for backwards compatibility - the implementation lives in ./paths.
export { normalizePath };

/**
 * Turns a validated `SiteDocument` into HTML.
 *
 * Everything a visitor sees is produced by React from validated props, so the
 * exported snapshot is plain markup with no framework runtime. The only
 * JavaScript is a tiny progressive-enhancement block (the mobile nav toggle);
 * with scripting off the site is still fully readable and navigable.
 */
export interface RenderOptions {
  /** Absolute origin of the published site, e.g. `https://acme.com`. Enables canonical/OG/sitemap. */
  siteUrl?: string;
  /** Inline the stylesheet in a `<style>` tag (preview iframe) instead of linking `styles.css`. */
  inlineCss?: boolean;
  /** Editor preview: internal links postMessage the studio instead of navigating. */
  preview?: boolean;
  /** `<html lang>`; defaults to `en`. */
  lang?: string;
}

/**
 * Progressive enhancement only. Every other hook the renderer emits is
 * declarative: `<details>` for the FAQ, `mailto:`/`wa.me` for the enquiry form.
 *
 * In the editor preview (`data-lv-preview`) internal links are intercepted and
 * reported to the embedding studio (`lv:navigate`), so clicking a nav item
 * swaps the previewed page instead of leaving the iframe. The published site
 * keeps plain, relative navigation.
 */
const SITE_SCRIPT = `(function(){
var t=document.querySelector("[data-lv-nav-toggle]");
if(!t||!t.closest)return;
var nav=t.closest(".lv-nav");
if(!nav)return;
t.addEventListener("click",function(){
var open=nav.getAttribute("data-open")==="true";
nav.setAttribute("data-open",open?"false":"true");
t.setAttribute("aria-expanded",open?"false":"true");
});
})();
(function(){
var preview=document.documentElement.getAttribute("data-lv-preview")==="true";
if(!preview||!document.addEventListener)return;
document.addEventListener("click",function(e){
var node=e.target;
var a=node&&node.closest?node.closest("a[data-lv-path]"):null;
if(!a)return;
e.preventDefault();
if(window.parent!==window)window.parent.postMessage({type:"lv:navigate",path:a.getAttribute("data-lv-path")},"*");
});
})();`;

/** The page at `path`, falling back to the first page so an unknown path still renders. */
export function findPage(document: SiteDocument, path: string): SitePage {
  const wanted = normalizePath(path);
  return document.pages.find((page) => normalizePath(page.path) === wanted) ?? document.pages[0]!;
}

/**
 * Output file for a page. Nested pages become directories (`/about` ->
 * `about/index.html`) so a static host can serve them with clean URLs.
 *
 * Page paths are only guaranteed to start with `/`, so each segment is reduced
 * to a safe filename. Without this a path like `/../../etc/passwd` would emit
 * `../../etc/passwd/index.html` and write outside the export directory.
 */
export function pageFilePath(page: SitePage): string {
  const segments = normalizePath(page.path)
    .split("/")
    .map(sanitizeSegment)
    .filter(Boolean);
  return segments.length > 0 ? `${segments.join("/")}/index.html` : "index.html";
}

/** Reduce one path segment to `[a-z0-9_-]`, dropping `.`/`..` and separators. */
function sanitizeSegment(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The document's stylesheet: base rules plus the validated theme's custom properties. */
export function renderSiteCss(document: SiteDocument): string {
  return `${SITE_CSS}\n${themeVariablesCss(normalizeTheme(document.theme))}\n`;
}

function head(document: SiteDocument, page: SitePage, options: RenderOptions): string {
  const origin = safeExternalUrl(options.siteUrl ?? "");
  const title = page.title || `${page.name} - ${document.siteName}`;
  const description = page.description || document.description || document.tagline;
  const theme = normalizeTheme(document.theme);
  const fonts = [theme.fonts.heading, theme.fonts.body]
    .filter((font, index, all) => all.indexOf(font) === index)
    .map((font) => `family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&");
  const fontHref = fonts ? safeExternalUrl(`https://fonts.googleapis.com/css2?${fonts}&display=swap`) : "";
  const pagePath = safeRelativeUrl(normalizePath(page.path));
  const canonical = origin && pagePath ? `${origin.replace(/\/$/, "")}${pagePath}` : "";
  // The export writes a copy of the stylesheet beside every page, so the href is
  // relative to the page itself (`about/index.html` -> `about/styles.css`).
  const styleHref = "styles.css";

  const tags = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(title)}</title>`,
    description ? `<meta name="description" content="${escapeHtml(description)}" />` : "",
    page.keywords.length > 0 ? `<meta name="keywords" content="${escapeHtml(page.keywords.join(", "))}" />` : "",
    page.noIndex ? `<meta name="robots" content="noindex, nofollow" />` : "",
    `<meta name="theme-color" content="${escapeHtml(theme.colors.background)}" />`,
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : "",
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(document.siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    description ? `<meta property="og:description" content="${escapeHtml(description)}" />` : "",
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    fontHref ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />` : "",
    fontHref ? `<link rel="stylesheet" href="${escapeHtml(fontHref)}" />` : "",
  ].filter(Boolean);

  const css = options.inlineCss
    ? `<style>${renderSiteCss(document)}</style>`
    : `<link rel="stylesheet" href="${escapeHtml(styleHref)}" />`;

  return [...tags, css].join("\n    ");
}

/** A complete, standalone HTML document for one page. */
export function renderPageHtml(document: SiteDocument, page: SitePage, options: RenderOptions = {}): string {
  const body = renderToStaticMarkup(<PageView document={document} page={page} />);
  return `<!doctype html>
<html lang="${escapeHtml(options.lang ?? "en")}"${options.preview ? ' data-lv-preview="true"' : ""}>
  <head>
    ${head(document, page, options)}
  </head>
  <body>
    ${body}
    <script>${SITE_SCRIPT}</script>
  </body>
</html>
`;
}

/** The payload the editor's preview iframe and the `/preview` endpoint expect. */
export function renderPreview(
  document: SiteDocument,
  path = "/",
  options: RenderOptions = {},
): PreviewResponseDto {
  const page = findPage(document, path);
  return {
    page: page.path,
    pageName: page.name,
    title: page.title || `${page.name} - ${document.siteName}`,
    html: renderPageHtml(document, page, { ...options, inlineCss: true, preview: true }),
    css: renderSiteCss(document),
    pages: document.pages.map((entry) => ({ name: entry.name, path: entry.path, title: entry.title })),
    versionNumber: document.meta.versionNumber,
  };
}

export interface ExportOptions extends RenderOptions {
  /** Directory name used for the downloadable bundle and the `netlify.toml` site name. */
  projectName?: string;
  /** Emit `sitemap.xml` and `robots.txt` (needs `siteUrl`; silently skipped without it). */
  includeSeoFiles?: boolean;
}

/** Language label for a generated file, matching what the file sync stores. */
function languageFor(path: string): string {
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".xml")) return "xml";
  if (path.endsWith(".txt")) return "text";
  if (path.endsWith(".json")) return "json";
  return "html";
}

/** Absolute URL for a page path, or `""` when there is no usable origin. */
function absoluteUrl(origin: string, path: string): string {
  const base = safeExternalUrl(origin).replace(/\/$/, "");
  if (!base) return "";
  const normalized = normalizePath(path);
  return normalized === "/" ? `${base}/` : `${base}${normalized}`;
}

/** `sitemap.xml` for the published site; empty when no origin is known. */
export function renderSitemap(document: SiteDocument, options: RenderOptions = {}): string {
  const origin = safeExternalUrl(options.siteUrl ?? "");
  if (!origin) return "";
  const urls = document.pages
    .filter((page) => !page.noIndex)
    .map((page) => {
      const loc = escapeHtml(absoluteUrl(origin, page.path));
      const lastmod = document.meta.generatedAt.slice(0, 10);
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobots(document: SiteDocument, options: RenderOptions = {}): string {
  const origin = safeExternalUrl(options.siteUrl ?? "").replace(/\/$/, "");
  const disallow = document.pages.some((page) => page.noIndex) ? "\nDisallow: /" : "";
  return `User-agent: *\nAllow: /${disallow}\n${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ""}`;
}

/**
 * Every file of the static site, keyed by its output path.
 *
 * One HTML file per page, the stylesheet beside it, plus sitemap/robots when an
 * origin is known. Paths are derived from the (validated) page path, so a page
 * can never escape the bundle directory.
 */
export function renderSiteFiles(document: SiteDocument, options: ExportOptions = {}): Map<string, string> {
  const files = new Map<string, string>();
  const css = `${renderSiteCss(document)}\n`;

  for (const page of document.pages) {
    const html = renderPageHtml(document, page, { ...options, inlineCss: false });
    files.set(pageFilePath(page), html);
    // Each page links `styles.css` relative to itself; a nested page therefore
    // needs the stylesheet in its own directory.
    const directory = pageFilePath(page).split("/").slice(0, -1);
    files.set([...directory, "styles.css"].join("/"), css);
  }

  if (options.includeSeoFiles !== false) {
    const sitemap = renderSitemap(document, options);
    if (sitemap) {
      files.set("sitemap.xml", sitemap);
      files.set("robots.txt", renderRobots(document, options));
    }
  }

  return files;
}

/** The downloadable bundle: the whole site as plain files. */
export function exportSite(document: SiteDocument, options: ExportOptions = {}): ExportResponseDto {
  const files = [...renderSiteFiles(document, options)].map(([path, content]) => ({
    path,
    language: languageFor(path),
    content,
  }));
  return {
    projectName: options.projectName || slugify(document.siteName, "site"),
    siteName: document.siteName,
    versionNumber: document.meta.versionNumber,
    files,
  };
}
