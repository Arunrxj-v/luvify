/**
 * Site-path helpers for navigation.
 *
 * Pages are exported as directories (`/about` -> `about/index.html`), and the
 * published site may live at the domain root *or* under a prefix such as
 * `/sites/<slug>/`, so internal links are emitted as document-relative URLs.
 * They therefore work at any base path, on refresh, and inside the editor's
 * preview iframe.
 */

/** The page path without query/hash and without a trailing slash. */
export function normalizePath(path: string): string {
  const trimmed = (path || "/").split(/[?#]/)[0] ?? "/";
  if (!trimmed.startsWith("/")) return `/${trimmed}`;
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : "/";
}

/**
 * Directory-relative URL from the page document at `from` to the one at `to`.
 * `/` -> `/about` is `about/`, `/about` -> `/` is `../`, and `/about` ->
 * `/services` is `../services/`. Trailing slashes are intentional: each page
 * is a directory with its own `index.html`.
 */
export function relativePageHref(from: string, to: string): string {
  const source = normalizePath(from).split("/").filter(Boolean);
  const target = normalizePath(to).split("/").filter(Boolean);
  let shared = 0;
  while (shared < source.length && shared < target.length && source[shared] === target[shared]) shared += 1;
  const parts = [...Array.from({ length: source.length - shared }, () => ".."), ...target.slice(shared)];
  return parts.length === 0 ? "./" : `${parts.join("/")}/`;
}

export interface ResolvedInternalLink {
  /** False when the href points at a page that does not exist in the document. */
  found: boolean;
  /** The href to render: a document-relative URL, or `#` for a dead link. */
  href: string;
  /** Normalized site path of the target page (data attribute / preview nav). */
  path: string;
}

/**
 * Resolves a root-absolute href against the document's page list.
 * Returns `null` when the href is not internal (external, `mailto:`, `tel:`,
 * `#anchor`...) - those must be left exactly as authored.
 */
export function resolveInternalLink(
  href: string,
  currentPath: string,
  pages: Array<{ path: string }>,
): ResolvedInternalLink | null {
  const value = href.trim();
  if (!value.startsWith("/") || value.startsWith("//")) return null;

  const suffixIndex = value.search(/[?#]/);
  const suffix = suffixIndex >= 0 ? value.slice(suffixIndex) : "";
  const target = normalizePath(value);
  const match = pages.find((page) => normalizePath(page.path).toLowerCase() === target.toLowerCase());
  if (!match) return { found: false, href: "#", path: target };

  const matchPath = normalizePath(match.path);
  return { found: true, href: `${relativePageHref(currentPath, matchPath)}${suffix}`, path: matchPath };
}
