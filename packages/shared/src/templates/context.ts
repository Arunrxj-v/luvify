import { DESIGN_STYLES, type DesignStyle, type SectionType, type WebsiteType } from "../enums";
import { buildProjectKnowledge, type ProjectKnowledge } from "../knowledge";
import { hasValue, type Requirements } from "../requirements";
import { SectionSchema, type Link, type Section } from "../site-sections";
import { makeSectionId, SiteContactSchema, type SiteContact, type SiteTheme, type SupportedFont } from "../site";

/**
 * Templates are real structured component configurations (never screenshots or
 * HTML blobs): a template composes validated sections into a `TemplateDraft`
 * that the registry turns into a SiteDocument. The same functions power the
 * Templates gallery, the mock generator and the seed data.
 */

export type TemplateId = "restaurant" | "saas" | "portfolio" | "agency" | "ecommerce" | "personal" | "services";

export interface TemplateContext {
  siteName: string;
  tagline?: string;
  contact?: Partial<SiteContact>;
  requirements?: Requirements;
  /**
   * The project's source of truth. When omitted it is derived from
   * `requirements`, so every template renders from the same knowledge the
   * specification and the validator use.
   */
  knowledge?: ProjectKnowledge;
  themeOverride?: Partial<Omit<SiteTheme, "colors" | "fonts">> & {
    colors?: Partial<SiteTheme["colors"]>;
    fonts?: Partial<SiteTheme["fonts"]>;
  };
  provider?: string;
}

export interface TemplatePageDraft {
  name: string;
  path: string;
  title: string;
  description: string;
  sections: Section[];
}

export interface TemplateTheme {
  style?: DesignStyle;
  dark?: boolean;
  radius?: number;
  buttonStyle?: SiteTheme["buttonStyle"];
  colors: Record<string, string>;
  fonts: { heading: string; body: string };
}

export interface TemplateDraft {
  siteName: string;
  tagline: string;
  theme: TemplateTheme;
  contact: SiteContact;
  navigation?: Link[];
  socials?: Link[];
  pages: TemplatePageDraft[];
}

export interface SiteTemplate {
  id: TemplateId;
  name: string;
  description: string;
  bestFor: string;
  websiteType: WebsiteType;
  swatch: { primary: string; accent: string; background: string };
  create: (context: TemplateContext) => TemplateDraft;
}

export function sec<T extends SectionType>(type: T, props: Record<string, unknown>): Section {
  return SectionSchema.parse({ id: makeSectionId(type), visible: true, type, ...props });
}

const STYLE_KEYWORDS: Record<DesignStyle, string[]> = {
  modern: ["modern", "clean", "sleek", "contemporary"],
  premium: ["premium", "high-end", "upscale", "elegant"],
  minimal: ["minimal", "simple", "quiet", "understated"],
  bold: ["bold", "loud", "punchy", "energetic"],
  warm: ["warm", "cozy", "friendly", "inviting"],
  editorial: ["editorial", "magazine", "story", "narrative"],
  playful: ["playful", "fun", "quirky", "colourful", "colorful"],
  corporate: ["corporate", "professional", "enterprise", "trustworthy"],
  luxury: ["luxury", "opulent", "exclusive", "prestige"],
  retro: ["retro", "vintage", "nostalgic", "classic"],
};

export function detectStyle(input: string, fallback: DesignStyle = "modern"): DesignStyle {
  const value = input.toLowerCase();
  for (const style of DESIGN_STYLES) {
    if (STYLE_KEYWORDS[style].some((keyword) => value.includes(keyword))) return style;
  }
  return fallback;
}

/**
 * Per-section item caps from the section schemas. Real client data (a full
 * menu, a 40-product catalog) can exceed what ONE section may render, and
 * `SectionSchema.parse` throws past these limits - so templates receive the
 * capped view while knowledge/facts keep the complete list.
 */
const SECTION_ITEM_CAPS = { services: 12, products: 24, testimonials: 9, faqs: 14 } as const;

export interface PersonalizedContent {
  siteName: string;
  tagline: string;
  headline: string;
  subheadline: string;
  productSummary: string;
  valueProposition: string;
  offerings: string[];
  audience: string;
  about: string[];
  services: Array<{ title: string; description: string; price: string }>;
  products: Array<{ name: string; description: string; priceCents: number; currency: string; category: string }>;
  testimonials: Array<{ quote: string; author: string; role: string; rating: number }>;
  faq: Array<{ question: string; answer: string }>;
  contact: SiteContact;
  socials: Link[];
  seoDescription: string;
  keywords: string[];
  theme: { style?: DesignStyle; colors: Partial<SiteTheme["colors"]>; fonts: Partial<SiteTheme["fonts"]> };
}

export function toCents(value: string | number | undefined): number {
  if (typeof value === "number") return Math.round(value * 100);
  if (!value) return 0;
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .flatMap((block) => block.split(/(?<=\.)\s+(?=[A-Z])/))
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 4);
}

export function resolveFonts(preference: string | undefined): Partial<SiteTheme["fonts"]> {
  if (!preference) return {};
  const [heading, body] = preference
    .split(/[+/]| and /i)
    .map((part) => part.trim())
    .filter(Boolean);
  const fonts: Partial<SiteTheme["fonts"]> = {};
  if (heading) fonts.heading = heading as SupportedFont;
  if (body) fonts.body = body as SupportedFont;
  return fonts;
}

/**
 * Fabrication guard: phrases that name specific facts the client never gave
 * (counts, years, awards, ratings). Templates use these lists to decide when
 * a fallback sentence may render and when silence is the honest option.
 */
const FABRICATED_FACT_PATTERN =
  /\b(\d+\+?\s*(years|clients|customers|patients|projects|orders|reviews|members|countries|cities|outlets|stores)|since\s+\d{4}|award|certified|#1|best in|trusted by \d|rated\s+\d(\.\d)?(\/\d)?)\b/i;

export function looksFabricated(copy: string): boolean {
  return FABRICATED_FACT_PATTERN.test(copy);
}

const GENERIC_MARKETING_PATTERN =
  /\b(innovative solutions|transform your business|journey to better|unlock.*potential|elevate your|cutting-edge|world-class|next-generation|seamless experience|digital transformation)\b/i;

/** True when copy says nothing about the client's actual business. */
export function looksGeneric(copy: string, contextWords: string[]): boolean {
  if (!GENERIC_MARKETING_PATTERN.test(copy)) return false;
  const lower = copy.toLowerCase();
  return !contextWords.some((word) => word.length > 3 && lower.includes(word.toLowerCase()));
}

/**
 * Grounds template copy in the client's own words: headline, offerings and
 * facts the client provided win; template fallbacks only fill gaps that carry
 * no invented specifics. Returns "" when there is nothing honest to say, so
 * templates render the block only when it is grounded.
 */
export function groundCopy(options: {
  client?: string;
  offerings?: string[];
  facts?: string[];
  fallback?: string;
  joiner?: string;
}): string {
  const client = options.client?.trim() ?? "";
  if (client) return client;
  const facts = (options.facts ?? []).map((fact) => fact.trim()).filter(Boolean);
  if (facts.length > 0) return facts.join(options.joiner ?? " ");
  const fallback = options.fallback?.trim() ?? "";
  if (!fallback) return "";
  // A fallback that invents specifics is worse than silence.
  if (looksFabricated(fallback)) return "";
  return fallback;
}

/** Grounded fallback services derived from offerings (never invented items). */
export function offeringServices(offerings: string[]): Array<{ title: string; description: string; price: string }> {
  return offerings
    .map((offering) => offering.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((offering) => ({
      title: offering.charAt(0).toUpperCase() + offering.slice(1),
      description: "",
      price: "",
    }));
}

/** Grounded FAQ entries: only questions the client's content can answer. */
export function groundedFaq(
  faq: Array<{ question: string; answer: string }>,
  offerings: string[],
): Array<{ question: string; answer: string }> {
  const known = offerings.map((offering) => offering.toLowerCase());
  return faq.filter((item) => {
    if (!item.question?.trim()) return false;
    if (item.answer?.trim()) return true;
    const question = item.question.toLowerCase();
    return known.some((offering) => offering.length > 3 && question.includes(offering));
  });
}

/**
 * Turns requirements into concrete, template-ready content. Missing fields fall
 * back to the template's own realistic copy, so both a fresh starter template
 * and a fully interviewed project produce a complete, validated site.
 */
export function personalize(context: TemplateContext): PersonalizedContent {
  const req = context.requirements;
  const siteName = context.siteName.trim() || req?.business.name || "New website";
  const currency = req?.ecommerce.currency?.toUpperCase() || "USD";
  const offerings = (req?.business.offerings ?? []).map((offering) => offering.trim()).filter(Boolean);
  const productSummary = req?.business.productSummary?.trim() ?? "";

  const socials: Link[] = Object.entries(req?.content.socials ?? {})
    .filter(([, value]) => hasValue(value))
    .map(([network, value]) => ({
      label: network.charAt(0).toUpperCase() + network.slice(1),
      path: value.startsWith("http") ? value : `https://${value}`,
      external: true,
    }));

  const rawProducts = req?.ecommerce.products?.length ? req.ecommerce.products : req?.content.products ?? [];

  return {
    siteName,
    tagline: context.tagline?.trim() || req?.content.subheadline || req?.website.purpose || "",
    headline: req?.content.headline?.trim() || "",
    subheadline: req?.content.subheadline?.trim() || "",
    productSummary,
    valueProposition: req?.business.valueProposition?.trim() ?? "",
    offerings,
    audience: req?.business.targetAudience?.trim() ?? "",
    about: req?.content.about?.trim() ? paragraphs(req.content.about.trim()) : [],
    services: ((req?.content.services ?? []).length
      ? (req?.content.services ?? [])
          .filter((service) => hasValue(service.name))
          .map((service) => ({ title: service.name, description: service.description, price: service.price }))
      : offeringServices(offerings)
    ).slice(0, SECTION_ITEM_CAPS.services),
    products: rawProducts
      .filter((product) => hasValue(product.name))
      .map((product) => ({
        name: product.name,
        description: product.description,
        priceCents: toCents(product.price),
        currency,
        category: product.category,
      }))
      .slice(0, SECTION_ITEM_CAPS.products),
    testimonials: (req?.content.testimonials ?? [])
      .filter((item) => hasValue(item.quote))
      .map((item) => ({ quote: item.quote, author: item.author, role: item.role, rating: 5 }))
      .slice(0, SECTION_ITEM_CAPS.testimonials),
    faq: groundedFaq(
      (req?.content.faq ?? []).filter((item) => hasValue(item.question)),
      offerings,
    ).slice(0, SECTION_ITEM_CAPS.faqs),
    contact: SiteContactSchema.parse({
      email: req?.content.contact.email || context.contact?.email || "",
      phone: req?.content.contact.phone || context.contact?.phone || "",
      address: req?.content.contact.address || context.contact?.address || "",
      hours: req?.content.contact.hours || context.contact?.hours || "",
      whatsapp: req?.content.contact.phone || context.contact?.whatsapp || "",
    }),
    socials,
    seoDescription: req?.technical.seo.defaultDescription || req?.business.description || "",
    keywords: req?.technical.seo.keywords?.length
      ? req.technical.seo.keywords
      : [req?.business.industry, req?.website.type].filter((value): value is string => hasValue(value)),
    theme: {
      style: req?.branding.style ? detectStyle(req.branding.style) : undefined,
      colors: {
        ...(hasValue(req?.branding.primaryColor) ? { primary: req?.branding.primaryColor } : {}),
        ...(hasValue(req?.branding.secondaryColor) ? { secondary: req?.branding.secondaryColor } : {}),
        ...(hasValue(req?.branding.accentColor) ? { accent: req?.branding.accentColor } : {}),
      },
      fonts: resolveFonts(req?.branding.fontPreference),
    },
  };
}

export function mergeTheme(
  base: { style?: DesignStyle; dark?: boolean; radius?: number; buttonStyle?: SiteTheme["buttonStyle"]; colors?: Record<string, string>; fonts?: { heading: string; body: string } },
  context: TemplateContext,
): TemplateTheme {
  const personalized = personalize(context);
  const colors = {
    ...(base.colors ?? {}),
    ...personalized.theme.colors,
    ...(context.themeOverride?.colors ?? {}),
  } as Record<string, string>;
  const fonts = {
    ...(base.fonts ?? { heading: "Inter", body: "Inter" }),
    ...personalized.theme.fonts,
    ...(context.themeOverride?.fonts ?? {}),
  } as { heading: string; body: string };

  return {
    style: context.themeOverride?.style ?? personalized.theme.style ?? base.style ?? "modern",
    dark: context.themeOverride?.dark ?? base.dark,
    radius: context.themeOverride?.radius ?? base.radius,
    buttonStyle: context.themeOverride?.buttonStyle ?? base.buttonStyle,
    colors,
    fonts,
  };
}

