import { z } from "zod";
import { DESIGN_STYLES, type SectionType } from "./enums";
import { normalizeHex } from "./format";
import { FooterSectionSchema, LinkSchema, SectionSchema, type Section } from "./site-sections";

/**
 * SiteDocument - the canonical, fully validated description of a generated
 * website. It is what the preview renders, what publishing snapshots, what
 * versions store and what the AI modifier edits.
 */

/** Curated Google Fonts allow-list: prevents arbitrary CSS injection via font names. */
export const SUPPORTED_FONTS = [
  "Inter",
  "Poppins",
  "Sora",
  "Space Grotesk",
  "Manrope",
  "Plus Jakarta Sans",
  "Outfit",
  "Work Sans",
  "DM Sans",
  "Nunito Sans",
  "Playfair Display",
  "DM Serif Display",
  "Libre Baskerville",
  "Lora",
  "Fraunces",
  "Cormorant Garamond",
  "Crimson Pro",
  "IBM Plex Sans",
  "Source Sans 3",
  "Archivo",
] as const;
export type SupportedFont = (typeof SUPPORTED_FONTS)[number];

const fontName = z
  .string()
  .default("Inter")
  .transform((value) => ((SUPPORTED_FONTS as readonly string[]).includes(value) ? (value as SupportedFont) : "Inter"));

const hex = (fallback: string) => z.string().default(fallback).transform((value) => normalizeHex(value, fallback));

export const ThemeSchema = z.object({
  style: z.enum(DESIGN_STYLES).default("modern"),
  dark: z.boolean().default(false),
  colors: z
    .object({
      primary: hex("#1f6feb"),
      secondary: hex("#0f172a"),
      accent: hex("#f59e0b"),
      background: hex("#ffffff"),
      surface: hex("#f8fafc"),
      foreground: hex("#0f172a"),
      muted: hex("#64748b"),
      border: hex("#e2e8f0"),
    })
    .default({})
    .transform((value) => value),
  fonts: z
    .object({
      heading: fontName,
      body: fontName,
    })
    .default({}),
  radius: z.number().int().min(0).max(32).default(14),
  containerWidth: z.union([z.literal(1100), z.literal(1200), z.literal(1280)]).default(1200),
  buttonStyle: z.enum(["solid", "outline", "pill", "square"]).default("solid"),
  sectionSpacing: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
});
export type SiteTheme = z.infer<typeof ThemeSchema>;

export const SitePageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z
    .string()
    .default("/")
    .transform((value) => (value.startsWith("/") ? value : `/${value}`)),
  title: z.string().default(""),
  description: z.string().default(""),
  keywords: z.array(z.string()).default([]),
  noIndex: z.boolean().default(false),
  sections: z.array(SectionSchema).default([]),
});
export type SitePage = z.infer<typeof SitePageSchema>;

export const SiteContactSchema = z.object({
  email: z.string().default(""),
  phone: z.string().default(""),
  address: z.string().default(""),
  hours: z.string().default(""),
  whatsapp: z.string().default(""),
});
export type SiteContact = z.infer<typeof SiteContactSchema>;

export const SiteDocumentSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  siteName: z.string().min(1),
  siteType: z.string().default("business"),
  tagline: z.string().default(""),
  description: z.string().default(""),
  theme: ThemeSchema.default({}),
  navigation: z.array(LinkSchema).default([]),
  pages: z.array(SitePageSchema).min(1),
  footer: FooterSectionSchema.extend({ id: z.string().default("footer"), visible: z.boolean().default(true) }),
  contact: SiteContactSchema.default({}),
  meta: z
    .object({
      generatedAt: z.string().default(() => new Date().toISOString()),
      generator: z.string().default("luvify"),
      provider: z.string().default("mock"),
      requirementsCompleteness: z.number().int().min(0).max(100).default(0),
      specificationVersion: z.number().int().default(1),
      versionNumber: z.number().int().default(1),
      notes: z.string().default(""),
    })
    .default({}),
});
export type SiteDocument = z.infer<typeof SiteDocumentSchema>;

export function parseSiteDocument(value: unknown): SiteDocument {
  return SiteDocumentSchema.parse(value);
}

let sectionSequence = 0;
export function makeSectionId(type: string): string {
  sectionSequence += 1;
  return `${type.toLowerCase()}-${sectionSequence.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export interface SectionContext {
  siteName: string;
  contact?: Partial<SiteContact>;
  primaryCta?: { label: string; path: string };
}

/**
 * Realistic placeholder content for the inspector's "add section" action, so a
 * manually added block never renders as lorem-ipsum garbage or breaks the
 * schema (every required field is satisfied).
 */
export function createPlaceholderSection(type: SectionType, context: SectionContext): Section {
  const site = context.siteName;
  const cta = context.primaryCta ?? { label: "Get in touch", path: "/contact" };
  const base = { id: makeSectionId(type), visible: true } as const;
  const raw: Record<SectionType, unknown> = {
    Navbar: { ...base, type, logoText: site, links: [{ label: "Home", path: "/" }], cta },
    Hero: {
      ...base,
      type,
      eyebrow: "Welcome",
      title: `${site} - a headline that states the value`,
      subtitle: "One or two sentences explaining what you do and who it is for.",
      primaryCta: cta,
      align: "left",
      size: "standard",
    },
    Features: {
      ...base,
      type,
      title: "Why choose us",
      items: [
        { title: "Feature one", description: "Explain the benefit in a single sentence." },
        { title: "Feature two", description: "Explain the benefit in a single sentence." },
        { title: "Feature three", description: "Explain the benefit in a single sentence." },
      ],
    },
    About: { ...base, type, title: "About us", body: ["Tell the story behind the business."] },
    Services: {
      ...base,
      type,
      title: "Services",
      items: [{ title: "Service one", description: "What is included and for whom." }],
    },
    Products: { ...base, type, title: "Products", items: [] },
    ProductGrid: { ...base, type, title: "Shop", items: [] },
    ProductCard: {
      ...base,
      type,
      product: { name: "Product name", description: "Short product description", priceCents: 0, currency: "USD" },
    },
    Pricing: {
      ...base,
      type,
      title: "Simple pricing",
      plans: [{ name: "Starter", price: "0", period: "per month", features: ["Feature"], cta }],
    },
    Testimonials: {
      ...base,
      type,
      title: "What clients say",
      items: [{ quote: "A short, specific testimonial.", author: "Client name", role: "Role, Company", rating: 5 }],
    },
    FAQ: {
      ...base,
      type,
      title: "Frequently asked questions",
      items: [{ question: "A common question?", answer: "A clear, concise answer." }],
    },
    Gallery: { ...base, type, title: "Gallery", images: [] },
    Contact: {
      ...base,
      type,
      title: "Contact us",
      email: context.contact?.email ?? "",
      phone: context.contact?.phone ?? "",
      address: context.contact?.address ?? "",
      showForm: true,
      formFields: ["name", "email", "message"],
      formAction: "mailto",
    },
    CTA: { ...base, type, title: "Ready to get started?", button: cta, variant: "solid" },
    Footer: { ...base, type, logoText: site, columns: [], socials: [] },
    Blog: {
      ...base,
      type,
      title: "Latest articles",
      posts: [{ title: "First article", excerpt: "A short summary of the article.", date: "" }],
    },
    Team: {
      ...base,
      type,
      title: "Meet the team",
      members: [{ name: "Team member", role: "Role" }],
    },
  };
  const parsed = SectionSchema.safeParse(raw[type]);
  if (parsed.success) return parsed.data;
  // Every raw definition above is valid; this fallback only guards future edits.
  return SectionSchema.parse({
    id: makeSectionId("CTA"),
    visible: true,
    type: "CTA",
    title: `${site}`,
    variant: "solid",
  });
}

export function createEmptySiteDocument(input: {
  siteName: string;
  siteType: string;
  tagline?: string;
  theme?: Partial<SiteTheme>;
  contact?: Partial<SiteContact>;
  provider?: string;
  completeness?: number;
}): SiteDocument {
  const siteName = input.siteName.trim() || "New website";
  const cta = { label: "Get in touch", path: "/contact" };
  const sectionContext: SectionContext = { siteName, contact: input.contact, primaryCta: cta };
  const navbar: Section = SectionSchema.parse({ ...createPlaceholderSection("Navbar", sectionContext), id: "navbar" });
  const hero: Section = SectionSchema.parse({ ...createPlaceholderSection("Hero", sectionContext), id: "hero" });
  const siteFooter = FooterSectionSchema.extend({
    id: z.string().default("footer"),
    visible: z.boolean().default(true),
  }).parse({
    ...createPlaceholderSection("Footer", sectionContext),
    logoText: siteName,
    id: "footer",
  });
  const footerLinks = [{ label: "Home", path: "/" }];

  return SiteDocumentSchema.parse({
    schemaVersion: 1,
    siteName,
    siteType: input.siteType,
    tagline: input.tagline ?? "",
    description: "",
    theme: input.theme ?? {},
    navigation: footerLinks,
    pages: [
      {
        id: "home",
        name: "Home",
        path: "/",
        title: siteName,
        description: input.tagline ?? "",
        sections: [navbar, hero],
      },
    ],
    footer: { ...siteFooter, columns: [{ title: "Site", links: footerLinks }] },
    contact: input.contact ?? {},
    meta: {
      generatedAt: new Date().toISOString(),
      generator: "luvify",
      provider: input.provider ?? "mock",
      requirementsCompleteness: input.completeness ?? 0,
    },
  });
}

export function cloneSiteDocument(doc: SiteDocument): SiteDocument {
  return SiteDocumentSchema.parse(structuredClone(doc));
}

export function getPage(doc: SiteDocument, path: string): SitePage | undefined {
  return doc.pages.find((page) => page.path === path || page.id === path);
}

export function findBySectionId(doc: SiteDocument, sectionId: string): { page: SitePage; section: Section } | undefined {
  for (const page of doc.pages) {
    const section = page.sections.find((entry) => entry.id === sectionId);
    if (section) return { page, section };
  }
  if (doc.footer.id === sectionId) {
    return { page: doc.pages[0]!, section: doc.footer };
  }
  return undefined;
}

export function siteSectionTypes(doc: SiteDocument): string[] {
  return doc.pages.flatMap((page) => page.sections.map((section) => section.type));
}

function revalidate(doc: SiteDocument): SiteDocument {
  return SiteDocumentSchema.parse(doc);
}

/** Merge a partial patch into one section (used by the inspector). */
export function updateSection(doc: SiteDocument, sectionId: string, patch: Record<string, unknown>): SiteDocument {
  const next = cloneSiteDocument(doc);
  if (next.footer.id === sectionId) {
    next.footer = { ...next.footer, ...patch } as SiteDocument["footer"];
    return revalidate(next);
  }
  for (const page of next.pages) {
    const index = page.sections.findIndex((section) => section.id === sectionId);
    if (index >= 0) {
      page.sections[index] = { ...page.sections[index]!, ...patch } as Section;
      return revalidate(next);
    }
  }
  return doc;
}

export function replaceSection(doc: SiteDocument, sectionId: string, section: Section): SiteDocument {
  const next = cloneSiteDocument(doc);
  const parsed = SectionSchema.parse({ ...section, id: sectionId });
  if (next.footer.id === sectionId) {
    next.footer = parsed as SiteDocument["footer"];
    return revalidate(next);
  }
  for (const page of next.pages) {
    const index = page.sections.findIndex((entry) => entry.id === sectionId);
    if (index >= 0) {
      page.sections[index] = parsed;
      return revalidate(next);
    }
  }
  return doc;
}

export function addSection(doc: SiteDocument, pagePath: string, section: Section, position?: number): SiteDocument {
  const next = cloneSiteDocument(doc);
  const page = next.pages.find((entry) => entry.path === pagePath) ?? next.pages[0];
  if (!page) return doc;
  const sections = [...page.sections];
  const insertAt = position === undefined ? sections.length : Math.max(0, Math.min(position, sections.length));
  sections.splice(insertAt, 0, SectionSchema.parse(section));
  page.sections = sections;
  return revalidate(next);
}

export function removeSection(doc: SiteDocument, sectionId: string): SiteDocument {
  const next = cloneSiteDocument(doc);
  for (const page of next.pages) {
    const before = page.sections.length;
    page.sections = page.sections.filter((section) => section.id !== sectionId);
    if (page.sections.length !== before) return revalidate(next);
  }
  return doc;
}

export function removePage(doc: SiteDocument, path: string): SiteDocument {
  const next = cloneSiteDocument(doc);
  if (next.pages.length <= 1) return doc;
  next.pages = next.pages.filter((page) => page.path !== path && page.id !== path);
  next.navigation = navigationFromPages(next.pages);
  return revalidate(next);
}

export function upsertPage(doc: SiteDocument, page: SitePage): SiteDocument {
  const next = cloneSiteDocument(doc);
  const index = next.pages.findIndex((entry) => entry.path === page.path || entry.id === page.id);
  if (index >= 0) {
    next.pages[index] = SitePageSchema.parse({ ...next.pages[index], ...page });
  } else {
    next.pages.push(SitePageSchema.parse(page));
  }
  next.navigation = navigationFromPages(next.pages);
  return revalidate(next);
}

export function setTheme(
  doc: SiteDocument,
  patch: Partial<Omit<SiteTheme, "colors" | "fonts">> & {
    colors?: Partial<SiteTheme["colors"]>;
    fonts?: Partial<SiteTheme["fonts"]>;
  },
): SiteDocument {
  const next = cloneSiteDocument(doc);
  next.theme = ThemeSchema.parse({
    ...next.theme,
    ...patch,
    colors: { ...next.theme.colors, ...(patch.colors ?? {}) },
    fonts: { ...next.theme.fonts, ...(patch.fonts ?? {}) },
  });
  return revalidate(next);
}

export function navigationFromPages(pages: Array<{ name: string; path: string }>): Array<{ label: string; path: string; external: boolean }> {
  return pages.map((page) => ({ label: page.name, path: page.path, external: false }));
}

function sectionSummary(section: Section): string {
  const props = section as unknown as Record<string, unknown>;
  const bits: string[] = [];
  const title = typeof props.title === "string" ? props.title : "";
  if (title) bits.push(`"${title}"`);
  for (const key of ["items", "plans", "images", "posts", "members"] as const) {
    const value = props[key];
    if (Array.isArray(value) && value.length > 0) bits.push(`${value.length} ${key}`);
  }
  if (!title && typeof props.logoText === "string" && props.logoText) bits.push(`logo "${props.logoText}"`);
  if (typeof props.align === "string") bits.push(`align ${props.align}`);
  return `- ${section.type} (id: ${section.id}${section.visible ? "" : ", hidden"}) ${bits.join(" · ")}`.trimEnd();
}

/**
 * Compact, model-friendly description of the current site. The modifier prompts
 * reason about this instead of the full JSON document, which keeps token usage
 * low and makes changes surgical.
 */
export function summarizeSiteDocument(doc: SiteDocument): string {
  const lines: string[] = [];
  lines.push(`Site: ${doc.siteName} (${doc.siteType})`);
  if (doc.tagline) lines.push(`Tagline: ${doc.tagline}`);
  lines.push(
    `Theme: ${doc.theme.style}${doc.theme.dark ? " dark" : " light"}, primary ${doc.theme.colors.primary}, accent ${doc.theme.colors.accent}, fonts ${doc.theme.fonts.heading}/${doc.theme.fonts.body}, radius ${doc.theme.radius}px`,
  );
  lines.push(`Navigation: ${doc.navigation.map((link) => `${link.label} (${link.path})`).join(", ") || "none"}`);
  for (const page of doc.pages) {
    lines.push(`Page ${page.name} (${page.path}) - ${page.sections.length} sections:`);
    for (const section of page.sections) lines.push(sectionSummary(section));
  }
  lines.push(
    `Footer: ${doc.footer.columns?.length ?? 0} link columns, socials ${doc.footer.socials?.length ?? 0}, newsletter ${doc.footer.newsletter ? "on" : "off"}`,
  );
  return lines.join("\n");
}

export function siteThemeSummary(doc: SiteDocument): {
  primary: string;
  accent: string;
  background: string;
  foreground: string;
  style: string;
} {
  return {
    primary: doc.theme.colors.primary,
    accent: doc.theme.colors.accent,
    background: doc.theme.colors.background,
    foreground: doc.theme.colors.foreground,
    style: doc.theme.style,
  };
}

export function siteContentStats(doc: SiteDocument): { pages: number; sections: number; words: number } {
  const serialized = JSON.stringify(doc.pages);
  const words = serialized.split(/\s+/).filter((token) => token.replace(/[^a-zA-Z]/g, "").length > 3).length;
  return {
    pages: doc.pages.length,
    sections: doc.pages.reduce((sum, page) => sum + page.sections.length, 0),
    words,
  };
}



