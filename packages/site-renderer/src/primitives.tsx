import type { ReactNode } from "react";
import { formatCurrency, initials, readableTextColor } from "@luvify/shared";
import type { Image } from "@luvify/shared";
import { useRenderContext } from "./context";
import { resolveInternalLink } from "./paths";

/** Rendering primitives shared by every section component. */
export function safeUrl(url: string | undefined | null, allowRelative = true): string {
  if (!url) return "";
  const value = url.trim();
  if (value === "" || value === "#" || /[\u0000-\u001f\u007f]/.test(value)) return "";
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value) || /^tel:/i.test(value)) return value;
  if (allowRelative && value.startsWith("/") && !value.startsWith("//")) return value;
  if (allowRelative && value.startsWith("#")) return value;
  return "";
}

/** Data URLs are limited to raster images and only used by image elements. */
export function safeImageUrl(url: string | undefined | null, allowRelative = true): string {
  const value = url?.trim() ?? "";
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (allowRelative && value.startsWith("/") && !value.startsWith("//")) return value;
  return "";
}

/** Only known map providers may be embedded in a sandboxed frame. */
export function safeMapEmbedUrl(url: string | undefined | null): string {
  if (!url) return "";
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return "";
    const host = parsed.hostname.toLowerCase();
    const allowed =
      host === "google.com" ||
      host.endsWith(".google.com") ||
      host === "google.co.uk" ||
      host.endsWith(".google.co.uk") ||
      host === "openstreetmap.org" ||
      host.endsWith(".openstreetmap.org");
    return allowed ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function Link({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  const context = useRenderContext();
  const safe = safeUrl(href) || "#";
  // Internal page links resolve to document-relative URLs so navigation works
  // wherever the site is served from (root, `/sites/<slug>/`, the preview
  // iframe) and survives refresh. Links to pages that do not exist degrade to
  // `#` instead of 404ing; external/mailto/tel/#anchor hrefs stay as authored.
  const internal = context.pages.length > 0 ? resolveInternalLink(safe, context.currentPath, context.pages) : null;
  const resolved = internal ? internal.href : safe;
  const external = /^https?:\/\//i.test(resolved);
  return (
    <a
      href={resolved}
      className={className}
      {...(internal?.found ? { "data-lv-path": internal.path } : {})}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children ?? label}
    </a>
  );
}

export function ButtonLink({
  href,
  label,
  variant = "primary",
  className,
}: {
  href: string;
  label: string;
  variant?: "primary" | "secondary" | "accent" | "outline" | "ghost";
  className?: string;
}) {
  return (
    <Link href={href} className={`lv-btn lv-btn--${variant}${className ? ` ${className}` : ""}`}>
      {label}
    </Link>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  align?: "left" | "center";
}) {
  if (!eyebrow && !title && !subtitle) return null;
  return (
    <header
      style={{
        marginBottom: "2.25rem",
        maxWidth: align === "center" ? "46rem" : undefined,
        marginInline: align === "center" ? "auto" : undefined,
        textAlign: align,
      }}
    >
      {eyebrow ? <span className="lv-eyebrow">{eyebrow}</span> : null}
      {title ? <h2>{title}</h2> : null}
      {subtitle ? <p className="lv-lede">{subtitle}</p> : null}
    </header>
  );
}

export function ImageFrame({
  image,
  ratio = "standard",
  className,
  fallbackLabel = "Image",
}: {
  image?: Image | { url?: string; alt?: string; caption?: string };
  ratio?: "wide" | "tall" | "standard";
  className?: string;
  fallbackLabel?: string;
}) {
  const url = safeImageUrl(image?.url);
  const alt = image?.alt?.trim() || fallbackLabel;
  const ratioClass = ratio === "wide" ? " lv-frame--wide" : ratio === "tall" ? " lv-frame--tall" : "";
  return (
    <figure className={`lv-frame${ratioClass}${className ? ` ${className}` : ""}`} style={{ margin: 0 }}>
      {url ? <img src={url} alt={alt} loading="lazy" /> : <div className="lv-frame__placeholder" role="img" aria-label={alt}>{alt}</div>}
      {image?.caption ? <figcaption className="lv-frame__caption">{image.caption}</figcaption> : null}
    </figure>
  );
}

export function Stars({ rating }: { rating: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  if (rounded === 0) return null;
  return (
    <span className="lv-stars" aria-label={`${rounded} out of 5`}>
      {"★".repeat(rounded)}
      {"☆".repeat(5 - rounded)}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="lv-unsupported">{message}</p>;
}

export function Avatar({ name, imageUrl }: { name: string; imageUrl?: string }) {
  const url = safeImageUrl(imageUrl);
  if (url) return <img src={url} alt={name} className="lv-team__avatar" style={{ objectFit: "cover" }} />;
  return (
    <div className="lv-team__avatar" aria-hidden="true">
      {initials(name) || "•"}
    </div>
  );
}

export function priceLabel(cents: number, currency: string): string {
  if (cents <= 0) return "Enquire";
  return formatCurrency(cents, currency || "USD");
}

export function textColorFor(background: string): string {
  return readableTextColor(background);
}

export function cx(...values: Array<string | false | undefined | null>): string {
  return values.filter(Boolean).join(" ");
}

export function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
