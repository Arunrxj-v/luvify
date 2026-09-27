import type { WebsiteType } from "../enums";
import { buildProjectKnowledge, validateDocument } from "../knowledge";
import { RequirementsSchema, emptyRequirements, mergeRequirements, type Requirements } from "../requirements";
import { navigationFromPages, SiteDocumentSchema, type SiteDocument } from "../site";
import type { Link } from "../site-sections";
import { mergeTheme, personalize, sec, type SiteTemplate, type TemplateContext, type TemplateDraft, type TemplateId } from "./context";
import { agencyTemplate } from "./agency";
import { ecommerceTemplate } from "./ecommerce";
import { personalTemplate } from "./personal";
import { portfolioTemplate } from "./portfolio";
import { restaurantTemplate } from "./restaurant";
import { saasTemplate } from "./saas";
import { servicesTemplate } from "./services";

export * from "./context";

export const SITE_TEMPLATES: SiteTemplate[] = [
  saasTemplate,
  restaurantTemplate,
  portfolioTemplate,
  agencyTemplate,
  ecommerceTemplate,
  personalTemplate,
  servicesTemplate,
];

export const TEMPLATE_IDS: TemplateId[] = SITE_TEMPLATES.map((template) => template.id);

export function getTemplate(id: string): SiteTemplate | undefined {
  return SITE_TEMPLATES.find((template) => template.id === id);
}

export function getTemplateOrThrow(id: string): SiteTemplate {
  const template = getTemplate(id);
  if (!template) {
    throw new Error(`Unknown template "${id}". Available: ${TEMPLATE_IDS.join(", ")}`);
  }
  return template;
}

/** Which template fits a given website type - used when the AI does not choose one. */
export function recommendTemplateForType(type: string): TemplateId {
  switch (type as WebsiteType) {
    case "ecommerce":
      return "ecommerce";
    case "restaurant":
      return "restaurant";
    case "portfolio":
      return "portfolio";
    case "saas":
      return "saas";
    case "agency":
      return "agency";
    case "personal":
    case "blog":
      return "personal";
    default:
      // Neutral structure without domain-specific copy - never agency-flavoured
      // by default, so a hospital or service business never renders studio content.
      return "services";
  }
}

export interface BuildSiteDocumentOptions {
  siteType: string;
  provider?: string;
  completeness?: number;
  versionNumber?: number;
  specificationVersion?: number;
}

/** Turns a template draft into a fully validated SiteDocument (single entry point). */
export function buildSiteDocument(draft: TemplateDraft, options: BuildSiteDocumentOptions): SiteDocument {
  const pages = draft.pages.map((page, index) => ({
    id: `${page.path === "/" ? "home" : page.path.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-")}-${index}`,
    name: page.name,
    path: page.path,
    title: page.title || `${page.name} - ${draft.siteName}`,
    description: page.description || draft.tagline,
    sections: page.sections,
  }));

  const navigation: Link[] = draft.navigation ?? navigationFromPages(pages);
  const footerColumns = [
    { title: "Pages", links: navigation },
    ...(draft.socials?.length ? [{ title: "Follow", links: draft.socials }] : []),
  ];

  const footer = SiteDocumentSchema.shape.footer.parse({
    id: "footer",
    visible: true,
    type: "Footer",
    logoText: draft.siteName,
    tagline: draft.tagline,
    columns: footerColumns,
    socials: draft.socials ?? [],
    contactEmail: draft.contact.email ?? "",
    contactPhone: draft.contact.phone ?? "",
    address: draft.contact.address ?? "",
    newsletter: false,
    newsletterNote: "",
    copyright: `© ${new Date().getFullYear()} ${draft.siteName}. All rights reserved.`,
    legalLinks: [],
  });

  return SiteDocumentSchema.parse({
    schemaVersion: 1,
    siteName: draft.siteName,
    siteType: options.siteType,
    tagline: draft.tagline,
    description: pages[0]?.description ?? "",
    theme: draft.theme,
    navigation,
    pages,
    footer,
    contact: draft.contact,
    meta: {
      generatedAt: new Date().toISOString(),
      generator: "luvify",
      provider: options.provider ?? "mock",
      requirementsCompleteness: options.completeness ?? 0,
      specificationVersion: options.specificationVersion ?? 1,
      versionNumber: options.versionNumber ?? 1,
    },
  });
}

/** Convenience: build a site straight from a template id + context. */
export function createSiteFromTemplate(
  templateId: TemplateId,
  context: TemplateContext,
  options: Omit<BuildSiteDocumentOptions, "siteType"> & { siteType?: string },
): SiteDocument {
  const template = getTemplateOrThrow(templateId);
  const draft = template.create(context);
  const document = buildSiteDocument(draft, { siteType: options.siteType ?? template.websiteType, ...options });
  // FACT/REQUIREMENT VALIDATION: every factual claim in the draft is checked
  // against the project's source of truth before the document leaves the
  // pipeline. Unsupported claims are removed or rewritten; safe creative copy
  // and verified client information pass through untouched. Drafts without
  // requirements validate against explicitly-empty knowledge, so template
  // previews render honest empty states instead of invented facts.
  const knowledge =
    context.knowledge ??
    buildProjectKnowledge(requirementsForKnowledge(context), {
      projectId: "",
      archetype: options.siteType ?? template.websiteType,
    });
  return validateDocument(document, knowledge).document;
}

/**
 * Requirements the knowledge builder sees: the stored requirements plus the
 * caller's contact block, which is equally client-provided information (the
 * project's saved contact details) and must count as verified.
 */
function requirementsForKnowledge(context: TemplateContext): Requirements {
  const base = context.requirements ?? emptyRequirements();
  const contact = context.contact;
  if (!contact) return base;
  const merged = {
    email: contact.email || base.content.contact.email,
    phone: contact.phone || base.content.contact.phone,
    address: contact.address || base.content.contact.address,
    hours: contact.hours || base.content.contact.hours,
    mapUrl: base.content.contact.mapUrl,
  };
  if (
    merged.email === base.content.contact.email &&
    merged.phone === base.content.contact.phone &&
    merged.address === base.content.contact.address &&
    merged.hours === base.content.contact.hours
  ) {
    return base;
  }
  return RequirementsSchema.parse(
    mergeRequirements(base, { content: { ...base.content, contact: merged } }),
  );
}

export { sec, mergeTheme, personalize };
