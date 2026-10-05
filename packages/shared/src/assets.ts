import { cloneSiteDocument, type SiteDocument } from "./site";

/**
 * Asset support: metadata-based file classification, delimited-data parsing
 * and the document hydration pass that puts client uploads onto the site.
 *
 * HYDRATION IS THE BRIDGE between "files stored" and "files used": every
 * generation/modify/restore runs `hydrateDocument`, which (a) clears image
 * references to assets that no longer exist and (b) fills empty image slots -
 * hero, gallery, about, product cards, team photos, the navbar logo - from the
 * project's own uploads, matching by category first and by filename <-> item
 * name second. It never invents URLs: with no matching upload the slot stays
 * empty and the renderer shows its honest placeholder.
 */

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type AssetKind = "LOGO" | "MENU" | "PHOTO" | "VIDEO" | "DOCUMENT" | "DATA";

export const ASSET_KINDS: AssetKind[] = ["LOGO", "MENU", "PHOTO", "VIDEO", "DOCUMENT", "DATA"];

/** Upload allowlist: extension -> content type. */
const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  txt: "text/plain",
  md: "text/markdown",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  mp4: "video/mp4",
  webm: "video/webm",
};

export const ALLOWED_CONTENT_TYPES = new Set(Object.values(EXTENSION_TYPES));

/** Canonical extension per content type (used for the stored file name). */
const TYPE_EXTENSIONS: Record<string, string> = Object.fromEntries(
  Object.entries(EXTENSION_TYPES).map(([ext, type]) => [type, ext]),
);

export function extensionOf(filename: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(filename.trim());
  return match?.[1]?.toLowerCase() ?? "";
}

/** Sniffs the real content type from magic bytes, falling back to extension. */
export function detectContentType(filename: string, bytes?: Uint8Array | null): string {
  const head = bytes ? Array.from(bytes.slice(0, 16)) : [];
  const startsWith = (...probe: number[]): boolean => head.length >= probe.length && probe.every((byte, index) => head[index] === byte);
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (startsWith(0x52, 0x49, 0x46, 0x46) && head.length >= 12 && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return "image/webp";
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) {
    const ext = extensionOf(filename);
    if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (startsWith(0x1a, 0x45, 0xdf, 0xa3)) return "video/webm";
  // MP4: "ftyp" brand marker at offset 4.
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return "video/mp4";

  const ext = extensionOf(filename);
  if (ext && EXTENSION_TYPES[ext]) return EXTENSION_TYPES[ext];

  // Last resort for SVG-like text payloads (no stable magic number).
  if (bytes && bytes.length > 0) {
    const text = new TextDecoder("utf-8", { fatal: false })
      .decode(bytes.slice(0, 512))
      .replace(/^\uFEFF/, "")
      .trimStart()
      .toLowerCase();
    if (text.startsWith("<svg") || text.startsWith("<?xml")) {
      if (text.includes("<svg")) return "image/svg+xml";
    }
    if (text.startsWith("#") || text.includes(",") || text.includes("\t")) return "text/csv";
  }
  return "application/octet-stream";
}

const LOGO_NAME = /(logo|wordmark|brandmark|brand[_-]?logo|favicon|icon[_-]?logo|mark\.(png|svg|jpg|webp))/;
const MENU_NAME = /(menu|food[_-]?list|drinks?[_-]?list|wine[_-]?list)/;
const CATALOG_NAME = /(catalog|catalogue|price[_-]?list|pricing[_-]?list|inventory|stock[_-]?list|products?[_-]?(list|export|import)|menu)/;

/**
 * Metadata-only classification - filename + sniffed content type, no image
 * recognition: LOGO (brand files), MENU (menu files), PHOTO / VIDEO (media),
 * DATA (tables we can import), DOCUMENT (everything else people read).
 */
export function classifyAsset(filename: string, contentType: string): AssetKind {
  const name = filename.toLowerCase();
  const type = contentType.toLowerCase();
  const ext = extensionOf(filename);
  if (LOGO_NAME.test(name)) return "LOGO";
  if (MENU_NAME.test(name)) return "MENU";
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"].includes(ext)) return "PHOTO";
  if (type.startsWith("video/") || ["mp4", "webm"].includes(ext)) return "VIDEO";
  if (type === "text/csv" || type === "text/tab-separated-values" || ["csv", "tsv", "xlsx", "xls"].includes(ext)) {
    return CATALOG_NAME.test(name) ? "MENU" : "DATA";
  }
  return "DOCUMENT";
}

/** The stored file name: server-generated id + canonical extension. */
export function storageNameFor(assetId: string, filename: string, contentType: string): string {
  const ext =
    TYPE_EXTENSIONS[contentType] ??
    (extensionOf(filename) && EXTENSION_TYPES[extensionOf(filename)] ? extensionOf(filename) : "");
  return `${assetId}${ext ? `.${ext}` : ""}`;
}

/** True when the browser can render this type inline in an <img> tag. */
export function isRenderableImage(contentType: string): boolean {
  return contentType.toLowerCase().startsWith("image/");
}

// ---------------------------------------------------------------------------
// Delimited data (CSV / TSV) parsing
// ---------------------------------------------------------------------------

export interface DelimitedParse {
  columns: string[];
  rows: Array<Record<string, string>>;
}

const MAX_PARSE_ROWS = 500;
const MAX_PARSE_COLUMNS = 60;

function detectDelimiter(sample: string): string {
  const candidates = [",", "\t", ";"];
  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < sample.length; index += 1) {
      const char = sample[index];
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === candidate) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * RFC 4180-style parser (quotes, escaped quotes, CRLF) with delimiter
 * detection - handles the CSV people actually export from Excel/Sheets.
 */
export function parseDelimited(text: string): DelimitedParse {
  const source = text.replace(/^\uFEFF/, "");
  const headerProbe = source.slice(0, 4000);
  const delimiter = detectDelimiter(headerProbe);

  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = (): void => {
    row.push(field);
    field = "";
    started = false;
  };
  const endRow = (): void => {
    endField();
    matrix.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    // Stop reading past the import cap: the header plus MAX_PARSE_ROWS rows.
    if (matrix.length > MAX_PARSE_ROWS) break;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && !started) {
      quoted = true;
      started = true;
      continue;
    }
    if (char === delimiter) {
      endField();
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      endRow();
      continue;
    }
    field += char;
    started = true;
  }
  if (field.length > 0 || row.length > 0) endRow();

  const nonEmpty = matrix.filter((cells) => cells.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return { columns: [], rows: [] };

  const seen = new Map<string, number>();
  const columns = (nonEmpty[0] ?? []).slice(0, MAX_PARSE_COLUMNS).map((raw, index) => {
    const base = raw.trim() || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });

  const rows: Array<Record<string, string>> = [];
  for (const cells of nonEmpty.slice(1)) {
    const entry: Record<string, string> = {};
    columns.forEach((column, index) => {
      entry[column] = (cells[index] ?? "").trim();
    });
    rows.push(entry);
  }
  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Document hydration
// ---------------------------------------------------------------------------

/** The server-side view of one asset, already carrying its public URL. */
export interface ClientAsset {
  id: string;
  url: string;
  kind: AssetKind;
  /** Brief slot id ("brand.logo", "media.hero", ...). */
  category: string;
  filename: string;
  alt: string;
}

export interface HydrateTeamMember {
  name: string;
  role: string;
  bio: string;
}

export interface HydrateOptions {
  assets: ClientAsset[];
  /** Client-provided people; replaces template-invented Team members. */
  team?: HydrateTeamMember[];
  /** false = only clear stale references (asset deleted); default fills slots. */
  fill?: boolean;
}

/** Matches `/api/projects/<p>/assets/<aid>` anywhere in a document string. */
const ASSET_REF = /\/api\/projects\/[^/"']+\/assets\/([A-Za-z0-9_-]+)/g;

function stopToken(token: string): boolean {
  return ["the", "and", "for", "with", "from", "photo", "image", "img", "jpg", "jpeg", "png", "webp"].includes(token);
}

function tokens(value: string): Set<string> {
  const parts = value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !stopToken(token));
  return new Set(parts);
}

/** Overlap score between an asset's filename and an item/person name. */
function nameScore(asset: ClientAsset, candidate: string): number {
  const left = tokens(asset.filename);
  const right = tokens(candidate);
  let score = 0;
  for (const token of right) if (left.has(token)) score += 1;
  return score;
}

/**
 * Fills image slots from the project's uploads and clears references to
 * deleted assets. Deterministic: the server passes assets in priority order
 * (slot category first, then oldest first), and nothing is ever invented.
 */
export function hydrateDocument(document: SiteDocument, options: HydrateOptions): SiteDocument {
  const next = cloneSiteDocument(document);
  const available = new Set(options.assets.map((asset) => asset.id));
  const fill = options.fill !== false;

  // 1. Always: an image whose asset was deleted becomes an empty slot again,
  //    so the renderer shows its placeholder instead of a broken image.
  const clearStale = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (!value.includes("/assets/")) return value;
      return value.replace(ASSET_REF, (match, assetId: string) => (available.has(assetId) ? match : ""));
    }
    if (Array.isArray(value)) return value.map(clearStale);
    if (value && typeof value === "object") {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        (value as Record<string, unknown>)[key] = clearStale((value as Record<string, unknown>)[key]);
      }
      return value;
    }
    return value;
  };
  clearStale(next);
  if (!fill) return next;

  const photos = options.assets.filter((asset) => asset.kind === "PHOTO");
  const logos = options.assets.filter((asset) => asset.kind === "LOGO");
  const used = new Set<string>();

  /** Next unused photo, optionally narrowed by slot or a match score. */
  const claim = (predicate?: (asset: ClientAsset) => boolean): ClientAsset | undefined => {
    const asset = photos.find((photo) => !used.has(photo.id) && (!predicate || predicate(photo)));
    if (asset) used.add(asset.id);
    return asset;
  };
  const bestMatch = (candidate: string, onlyUnused = true): ClientAsset | undefined => {
    let best: ClientAsset | undefined;
    let bestScore = 0;
    for (const photo of photos) {
      if (onlyUnused && used.has(photo.id)) continue;
      const score = nameScore(photo, candidate);
      if (score > bestScore) {
        best = photo;
        bestScore = score;
      }
    }
    return best;
  };
  const slotPhoto = (slot: string): ClientAsset | undefined =>
    claim((photo) => photo.category === slot) ?? claim();

  // 2. Navbar logo - every page's navbar gets the real logo when one exists.
  const logo = logos[0];
  if (logo) {
    for (const page of next.pages) {
      for (const section of page.sections) {
        if (section.type === "Navbar" && !section.logoImageUrl) {
          section.logoImageUrl = logo.url;
        }
      }
    }
  }

  // 3. Hero images - the homepage prefers the hero slot, later pages the rest.
  for (const page of next.pages) {
    for (const section of page.sections) {
      if (section.type === "Hero" && !section.image?.url) {
        const asset = page.path === "/" ? slotPhoto("media.hero") : claim();
        if (asset) section.image = { url: asset.url, alt: asset.alt || page.title, caption: "" };
      }
    }
  }

  // 4. About image + gallery grid.
  for (const page of next.pages) {
    for (const section of page.sections) {
      if (section.type === "About" && !section.image?.url) {
        const asset = claim();
        if (asset) section.image = { url: asset.url, alt: asset.alt || page.title, caption: "" };
      }
      if (section.type === "Gallery") {
        while (section.images.length < 8) {
          const asset = claim();
          if (!asset) break;
          section.images.push({ url: asset.url, alt: asset.alt, caption: "" });
        }
      }
    }
  }

  // 5. Product cards - matched to photos by filename <-> product name first,
  //    then any remaining photo; never a fabricated image.
  const productItems = (section: { type: string }): Array<{ name?: string; imageUrl?: string }> | null => {
    if (section.type === "Products" || section.type === "ProductGrid") {
      return (section as { items?: Array<{ name?: string; imageUrl?: string }> }).items ?? [];
    }
    if (section.type === "ProductCard") {
      const product = (section as { product?: { name?: string; imageUrl?: string } }).product;
      return product ? [product] : [];
    }
    return null;
  };
  for (const page of next.pages) {
    for (const section of page.sections) {
      const items = productItems(section);
      if (!items) continue;
      for (const item of items) {
        if (item.imageUrl || !item.name) continue;
        const photo = bestMatch(item.name) ?? claim();
        if (photo) item.imageUrl = photo.url;
      }
    }
  }

  // 6. Team - client-provided people replace the template's invented members.
  const team = options.team ?? [];
  if (team.length > 0) {
    const personPhotos = photos.filter((photo) => photo.category === "media.people");
    for (const page of next.pages) {
      for (const section of page.sections) {
        if (section.type !== "Team") continue;
        section.members = team.slice(0, 12).map((member) => {
          const photo =
            [...personPhotos, ...photos].find(
              (candidate) => nameScore(candidate, member.name) > 0 && !used.has(candidate.id),
            ) ?? personPhotos.find((candidate) => nameScore(candidate, member.name) > 0);
          if (photo) used.add(photo.id);
          return {
            name: member.name,
            role: member.role,
            bio: member.bio,
            imageUrl: photo?.url ?? "",
            socialLinks: [],
          };
        });
      }
    }
  }

  return next;
}
