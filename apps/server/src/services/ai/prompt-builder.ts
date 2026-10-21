/**
 * Stage 1 of generation: turn one project's requirements into a structured,
 * project-scoped website specification, then render that specification as the
 * detailed prompt the website-generation model receives.
 *
 *   project context -> specification -> generation prompt -> provider
 *
 * Two rules shape this module:
 *
 * 1. PROJECT ISOLATION - the only inputs are the current project's own
 *    requirements, knowledge, page plan, corrections and assets. Nothing is
 *    read from module-level state, the database or another project.
 * 2. NO FABRICATION - user-provided facts, requests, preferences, unknowns and
 *    explicit exclusions are kept as separate fields. Unknown data is listed as
 *    unknown and is never silently replaced with invented business facts.
 */

import {
  analyzeIndustryGaps,
  archetypeLabel,
  buildProjectKnowledge,
  classifyArchetype,
  filterSections,
  hasValue,
  planArchitecture,
  planPageContent,
  stripIrrelevantPages,
  type IndustryAssetRequirement,
  type IndustryGapAnalysis,
  type IndustryInfoRequirement,
  type ProjectKnowledge,
  type Requirements,
  type SectionType,
  type SiteDocument,
  type WebsiteArchetype,
} from "@luvify/shared";

/** Bumped whenever the prompt architecture changes materially. */
export const GENERATION_PROMPT_VERSION = "v3";

export interface GenerationProjectInput {
  id: string;
  name: string;
  businessName: string;
  websiteType: string;
  templateId?: string | null;
}

export interface GenerationPlanInput {
  archetype: string;
  pages: Array<{ name: string; path: string; purpose: string; contentRequirements?: string[] }>;
  userJourneys?: Array<{ goal: string; steps: string[] }>;
}

/** One uploaded asset, described by what it actually is (never by guesswork). */
export interface GenerationAssetInput {
  id?: string;
  filename: string;
  kind: string;
  category?: string;
  alt?: string;
  url?: string;
}

export interface BuildGenerationSpecificationInput {
  project: GenerationProjectInput;
  requirements: Requirements;
  knowledge?: ProjectKnowledge;
  plan?: GenerationPlanInput;
  assets?: GenerationAssetInput[];
  extraFacts?: string[];
  /** Client/assistant messages for this project only (used for corrections). */
  conversation?: Array<{ role: string; content: string }>;
}

export interface GenerationService {
  name: string;
  description: string;
  price: string;
  duration: string;
  features: string[];
}

export interface GenerationProduct {
  name: string;
  description: string;
  price: string;
  category: string;
  sizes: string[];
  colors: string[];
  variants: string[];
  imageUrl: string;
}

export type GenerationAssetType =
  | "logo"
  | "hero_image"
  | "product_image"
  | "gallery_image"
  | "team_photo"
  | "profile_photo"
  | "menu"
  | "video"
  | "document"
  | "icon"
  | "other";

export interface GenerationAsset {
  filename: string;
  kind: string;
  category: string;
  type: GenerationAssetType;
  meaning: string;
  purpose: string;
  associatedEntity: string;
  intendedPages: string[];
  usageInstructions: string;
  url?: string;
}

export interface GenerationContact {
  email: string;
  phone: string;
  address: string;
  hours: string;
}

export interface GenerationDesign {
  style: string;
  mood: string;
  tone: string;
  layout: string;
  imageryDirection: string;
  animation: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
  };
  references: string[];
}

export interface GenerationPageSpec {
  name: string;
  path: string;
  purpose: string;
  targetUser: string;
  requiredSections: string[];
  sectionRequirements: string[];
  requiredContent: string[];
  requiredComponents: string[];
  requiredFunctionality: string[];
  requiredAssets: string[];
  seo: {
    titleGuidance: string;
    descriptionGuidance: string;
    focusTerms: string[];
  };
  cta: { label: string; path: string } | null;
  navigation: string[];
  availableFacts: string[];
  assets: string[];
  restrictions: string[];
}

export interface GenerationNavigationItem {
  label: string;
  path: string;
}

export interface WebsiteGenerationSpecification {
  promptVersion: string;
  project: {
    id: string;
    name: string;
    websiteType: string;
    industry: string;
    purpose: string;
    targetAudience: string;
    archetype: string;
    archetypeLabel: string;
  };
  business: {
    name: string;
    description: string;
    tagline: string;
    valueProposition: string;
    offerings: string[];
    services: GenerationService[];
    products: GenerationProduct[];
    contact: GenerationContact;
  };
  userProvidedFacts: string[];
  userRequests: string[];
  userPreferences: string[];
  requiredFunctionality: string[];
  industry: {
    profile: string;
    profileId: string;
    confidence: string;
    requiredInformation: IndustryInfoRequirement[];
    missingRequiredInformation: IndustryInfoRequirement[];
    missingRecommendedInformation: IndustryInfoRequirement[];
    missingPages: string[];
    missingAssets: IndustryAssetRequirement[];
    designNotes: string[];
    seoFocus: string[];
  };
  factClassification: {
    providedFacts: string[];
    inferredDesignDecisions: string[];
    missingInformation: string[];
  };
  design: GenerationDesign;
  inferredStructure: string[];
  pages: GenerationPageSpec[];
  navigation: {
    primary: GenerationNavigationItem[];
    allRoutes: GenerationNavigationItem[];
    ctaRoutes: Array<{ label: string; path: string; from: string }>;
  };
  assets: GenerationAsset[];
  constraints: string[];
  explicitExclusions: string[];
  unknowns: string[];
  contentRules: string[];
  userProvidedContent: {
    headline: string;
    subheadline: string;
    about: string;
    galleryNotes: string;
    socials: Array<{ network: string; url: string }>;
  };
  changeRequests: string[];
  contentGaps: string[];
  responsiveRequirements: string[];
  accessibilityRequirements: string[];
  ctaRequirements: string[];
  imageRequirements: string[];
  crossPageConsistency: string[];
}

const FEATURE_LABELS: Record<string, string> = {
  contactForm: "contact form",
  booking: "online booking / appointment request",
  newsletter: "newsletter sign-up",
  authentication: "user accounts / sign-in",
  payments: "online payments",
  blog: "blog / articles",
  ecommerce: "product catalogue and shopping",
  search: "site search",
  reviews: "customer reviews",
  delivery: "delivery / shipping information",
  multiLanguage: "multiple languages",
  liveChat: "live chat",
};

const RESPONSIVE_REQUIREMENTS = [
  "Mobile-first layout that works from 320px to large desktop screens.",
  "Every page must remain usable with a single column on small screens.",
  "Primary navigation must collapse into an accessible mobile menu.",
  "Tap targets must be at least 44px; text must not overflow buttons or cards.",
  "Use semantic headings, visible focus states and readable colour contrast.",
  "Images must be responsive and never distort or overflow their containers.",
  "Respect prefers-reduced-motion for any animation or transition.",
];

const ACCESSIBILITY_REQUIREMENTS = [
  "Use semantic landmarks and a single descriptive H1 per page; do not skip heading levels.",
  "Every form control must have a visible, programmatically associated label.",
  "Every image must have accurate alt text when it conveys content; purely decorative images use empty alt text.",
  "Interactive controls must be keyboard reachable with a visible focus indicator.",
  "Maintain readable text contrast against backgrounds; never rely on colour alone to convey meaning.",
  "Use descriptive link and button text; never use vague labels such as \"click here\".",
  "Provide an accessible mobile navigation control with its state announced to assistive technology.",
  "Respect prefers-reduced-motion for all animation and transitions.",
];

const CTA_REQUIREMENTS = [
  "Every CTA must name a real action and route to an existing generated page or a client-supplied external destination.",
  "Never invent checkout, booking, trial, subscription or payment behaviour that the project does not support.",
  "Use one primary CTA per page where possible; secondary CTAs must not compete visually.",
  "CTA labels must stay consistent across pages for the same destination.",
  "Booking or enquiry CTAs must reflect the client's actual method and must not promise live availability or instant confirmation.",
  "Do not create dead links, placeholder paths or buttons that lead nowhere.",
];

const IMAGE_REQUIREMENTS = [
  "Use uploaded project images only; never substitute unrelated stock photography for products, people, rooms or work.",
  "Match each image to the entity it actually depicts; never attach a photo to a different product or person.",
  "Set descriptive alt text from supplied facts; never invent what an image shows.",
  "When a required image is missing, use an honest editable placeholder instead of a fabricated or unrelated image.",
  "Keep image crops responsive without distortion, overflow or layout shift.",
  "Do not imply that an asset exists when none was uploaded.",
];

const CROSS_PAGE_CONSISTENCY = [
  "The business name, logo, contact details, navigation and footer must match on every page.",
  "The primary offering, audience and value proposition must not contradict another page.",
  "A product, room, service or person must have the same supplied name, price and details wherever it appears.",
  "Every navigation item and CTA destination must resolve to a generated route.",
  "Use one consistent tone, terminology and visual hierarchy across all pages.",
  "Do not repeat the same generic page copy across different pages.",
  "Missing facts must stay missing consistently; never fill a gap on one page with an invented value.",
];

const CONTENT_RULES = [
  "Prefer user-provided content over newly written copy.",
  "Never fabricate business facts.",
  "Never fabricate prices.",
  "Never fabricate addresses.",
  "Never fabricate phone numbers or emails.",
  "Never fabricate staff, team members or named people.",
  "Never fabricate testimonials or reviews.",
  "Never fabricate certifications.",
  "Never fabricate awards.",
  "Never fabricate statistics, patient/customer counts or years of experience.",
  "Never fabricate offerings, catalogue items, policies, departments or opening hours.",
  "Never introduce unrelated business content or content from another project.",
  "If content is missing, omit the section, use concise neutral placeholder copy, or show an editable UI placeholder.",
  "Never present an invented detail as a factual business claim.",
];

const GENERATION_REQUIREMENTS = [
  "Generate only what is supported by this specification.",
  "Treat user-provided facts as the only source of factual business information.",
  "Treat the latest explicit user correction as higher priority than the original requirements and domain defaults.",
  "Do not invent business facts, people, prices, availability, policies, statistics, addresses or contact details.",
  "Do not use content, images or concepts from any other project.",
  "Use only the pages listed in REQUIRED PAGES. Do not add pages that are not required.",
  "Use the page-by-page requirements for each page; do not give every page the same generic copy.",
  "Ensure every navigation item routes to a generated page.",
  "Ensure every CTA button routes to a valid generated page or an explicit external destination supplied by the client.",
  "Keep the wording and structure consistent across pages.",
  "Do not claim integrations, live availability or backend behaviour that the project does not actually support.",
  "The generated website must be internally consistent and ready to render.",
];

const DOMAIN_EXCLUSIONS: Record<string, string[]> = {
  healthcare: [
    "ecommerce pages or product listings",
    "shopping cart or checkout",
    "unrelated retail catalogue content",
    "food-service or reservation content",
    "unrelated portfolio or case-study pages",
    "unrelated product-business or lifestyle content",
    "generic studio copy",
    "invented hospital departments or specialties",
    "invented doctors, staff names or qualifications",
    "invented medical statistics or success rates",
    "invented testimonials from patients",
    "invented awards or certifications",
    "invented addresses, phone numbers, emails or opening hours",
    "invented appointment times, availability or insurance coverage",
  ],
  hotel: [
    "ecommerce cart, checkout or product listings",
    "medical, healthcare or appointment-booking pages",
    "food-service or restaurant-only pages unless the property has a restaurant",
    "invented room types, rates, amenities or availability",
    "invented check-in/check-out times or house policies",
    "invented guest reviews or star ratings",
  ],
  restaurant: [
    "medical, healthcare or appointment-booking pages",
    "ecommerce cart or checkout unless the client explicitly sells online",
    "online ordering unless the client explicitly requested it",
    "unrelated portfolio or case-study pages",
    "invented menu items, prices or ingredients",
    "invented awards or restaurant reviews",
    "invented addresses, phone numbers or opening hours",
    "invented reservation availability",
  ],
  ecommerce: [
    "medical, healthcare or appointment-booking pages",
    "food-service or reservation pages",
    "unrelated portfolio or case-study pages",
    "invented products, prices, variants or stock levels",
    "invented customer reviews or ratings",
    "invented shipping, returns or refund policies",
    "invented addresses or contact details",
  ],
  portfolio: [
    "ecommerce shop, cart or checkout",
    "medical, healthcare or appointment-booking pages",
    "food-service or reservation pages",
    "invented clients, awards, statistics or case-study results",
    "invented testimonials",
  ],
  agency: [
    "ecommerce shop, cart or checkout",
    "medical, healthcare or appointment-booking pages",
    "food-service or reservation pages",
    "invented clients, awards, statistics or case-study results",
    "invented testimonials",
  ],
  saas: [
    "ecommerce physical product pages",
    "medical, healthcare or appointment-booking pages",
    "food-service or reservation pages",
    "invented pricing, uptime, security or customer claims",
    "invented testimonials or customer logos",
  ],
  business: [
    "ecommerce shop, cart or checkout unless the client explicitly sells products",
    "medical, healthcare or appointment-booking pages unless the business provides healthcare",
    "food-service or reservation pages unless the business serves food",
    "portfolio or agency case-study pages unless the business is an agency",
    "invented statistics, awards, certifications or testimonials",
  ],
  custom: [
    "content or pages that belong to a different business or industry",
    "invented business facts, people, prices, statistics, awards or testimonials",
  ],
};

const PAGE_TARGET_USERS: Record<string, string> = {
  healthcare: "Patients and carers",
  hotel: "Guests and prospective guests",
  restaurant: "Diners and visitors",
  ecommerce: "Shoppers",
  portfolio: "Prospective clients",
  agency: "Prospective clients",
  saas: "Prospective users and customers",
  business: "Prospective customers",
  custom: "Visitors",
};

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function list(values: string[], empty = "None provided."): string {
  return values.length > 0 ? values.join("; ") : empty;
}

function bullet(items: string[], empty = "None provided."): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`;
}

function normalizePath(path: string): string {
  if (!path.trim()) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

function normalizeArchetype(value: string): WebsiteArchetype {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return "custom";
  return candidate as WebsiteArchetype;
}

function inferArchetype(requirements: Requirements, plan?: GenerationPlanInput): string {
  if (plan?.archetype && plan.archetype.trim()) return plan.archetype.trim().toLowerCase();
  if (requirements.website.archetype.trim()) return requirements.website.archetype.trim().toLowerCase();
  return classifyArchetype({
    productSummary: requirements.business.productSummary,
    description: requirements.business.description,
    industry: requirements.business.industry,
    websiteType: requirements.website.type,
    requiredPages: requirements.website.requiredPages,
    features: requirements.features as unknown as Record<string, boolean>,
    audience: requirements.business.targetAudience,
    purpose: requirements.website.purpose,
  });
}

interface ClientCorrection {
  exclusions: string[];
  onlyTerms: string[];
  /** Messages containing an actual exclusion or "only" instruction. */
  requests: string[];
}

const EXCLUSION_PATTERN =
  /\b(?:do not|don'?t|never|exclude|remove|drop|omit|avoid|without|no)\b\s+([^.!?;\n]{2,140})/gi;
const ONLY_PATTERN = /\bonly\b\s+(?:include|show|use|generate|list|offer|provide|display|add)?\s*([^.!?;\n]{2,160})/gi;

/**
 * Extracts explicit client corrections from this project's own change
 * requests / conversation. These become exclusions and "only" constraints;
 * they never add facts.
 */
function clientCorrections(
  requirements: Requirements,
  conversation: Array<{ role: string; content: string }> | undefined,
): ClientCorrection {
  const messages = unique([
    ...requirements.website.changeRequests,
    ...(conversation ?? [])
      .filter((entry) => entry.role === "user")
      .slice(-12)
      .map((entry) => entry.content),
  ]);
  const exclusions: string[] = [];
  const onlyTerms: string[] = [];
  const requests: string[] = [];
  for (const message of messages) {
    let matched = false;
    for (const match of message.matchAll(EXCLUSION_PATTERN)) {
      const value = match[1]?.trim();
      if (value) {
        exclusions.push(value.replace(/[.,;:!?]+$/, ""));
        matched = true;
      }
    }
    for (const match of message.matchAll(ONLY_PATTERN)) {
      const value = match[1]?.trim();
      if (value) {
        onlyTerms.push(value.replace(/[.,;:]+$/, ""));
        matched = true;
      }
    }
    // "Use only these pages" is a constraint even if no term follows `only`.
    if (!matched && /\bonly\b/i.test(message) && /\bpages?\b/i.test(message)) matched = true;
    if (matched) requests.push(message);
  }
  return { exclusions: unique(exclusions), onlyTerms: unique(onlyTerms), requests: unique(requests) };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pagesFor(
  requirements: Requirements,
  archetype: string,
  plan: GenerationPlanInput | undefined,
  onlyTerms: string[],
  correctionMessages: string[] = [],
): Array<{ name: string; path: string; purpose: string; contentRequirements: string[] }> {
  let pages: Array<{ name: string; path: string; purpose: string; contentRequirements: string[] }>;
  const commerce = requirements.features.ecommerce || requirements.features.payments;
  if (plan?.pages && plan.pages.length > 0) {
    pages = plan.pages.map((page) => ({
      name: page.name.trim(),
      path: normalizePath(page.path),
      purpose: page.purpose.trim(),
      contentRequirements: page.contentRequirements ?? [],
    }));
    // Never let the planner smuggle commerce pages into a non-commerce site.
    const kept = new Set(
      stripIrrelevantPages(
        pages.map((page) => ({ name: page.name, path: page.path })),
        normalizeArchetype(archetype),
        { requested: requirements.website.requiredPages, commerce, payments: requirements.features.payments },
      ).map((page) => page.path),
    );
    pages = pages.filter((page) => kept.has(page.path));
  } else {
    const planned = planArchitecture(normalizeArchetype(archetype), {
      productSummary: requirements.business.productSummary,
      offerings: requirements.business.offerings,
      requiredPages: requirements.website.requiredPages,
      conversionAction: requirements.website.conversionAction,
      targetAudience: requirements.business.targetAudience,
    });
    const purposes = new Map(planned.pages.map((page) => [page.path.toLowerCase(), page.purpose]));
    pages = stripIrrelevantPages(planned.pages, normalizeArchetype(archetype), {
      requested: requirements.website.requiredPages,
      commerce: requirements.features.ecommerce || requirements.features.payments,
      payments: requirements.features.payments,
    }).map((page) => ({
      ...page,
      purpose: purposes.get(page.path.toLowerCase()) ?? "",
      contentRequirements: [],
    }));
  }

  // "Use only these pages" narrows the plan; it can never add pages.
  const knownNames = unique([
    ...requirements.website.requiredPages,
    ...pages.map((page) => page.name),
  ]);
  const onlyText = onlyTerms.join(" ").toLowerCase();
  const explicitOnlyNames = knownNames.filter((name) => {
    const needle = name.trim().toLowerCase();
    return needle.length > 0 && new RegExp(`\\b${escapeRegExp(needle)}\\b`).test(onlyText);
  });
  const hasOnlyPagesWord =
    onlyTerms.some((term) => /\bpages\b/i.test(term)) ||
    correctionMessages.some((message) => /\bonly\b/i.test(message) && /\bpages\b/i.test(message));
  const listLikeOnly = explicitOnlyNames.length >= 2 && /[,]|\band\b/i.test(onlyText);
  const onlyPages = hasOnlyPagesWord || listLikeOnly;
  const onlyAllowed = new Set(
    (explicitOnlyNames.length > 0 ? explicitOnlyNames : requirements.website.requiredPages)
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );
  if (onlyPages && onlyAllowed.size > 0) {
    pages = pages.filter((page) => onlyAllowed.has(page.name.toLowerCase()) || page.path === "/");
  }

  // Required pages must always appear, unless an explicit "only these pages"
  // correction narrowed the site to a smaller set.
  const requiredNames = onlyPages && explicitOnlyNames.length > 0
    ? explicitOnlyNames
    : requirements.website.requiredPages;
  for (const name of requiredNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page";
    if (pages.some((page) => page.name.toLowerCase() === trimmed.toLowerCase() || page.path === `/${slug}`)) {
      continue;
    }
    pages.push({
      name: trimmed,
      path: `/${slug}`,
      purpose: `Requested explicitly by the client for ${requirements.business.productSummary || "this project"}`,
      contentRequirements: [],
    });
  }

  if (!pages.some((page) => page.path === "/")) {
    pages.unshift({
      name: "Home",
      path: "/",
      purpose: "Introduce the business and drive the primary conversion action",
      contentRequirements: [],
    });
  }

  const seen = new Set<string>();
  return pages.filter((page) => {
    const key = page.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function domainUnknowns(archetype: string, knowledge: ProjectKnowledge): string[] {
  const unknowns: string[] = [];
  const add = (condition: boolean, label: string): void => {
    if (condition) unknowns.push(label);
  };
  if (archetype === "healthcare") {
    add(knowledge.team.length === 0, "doctor names, profiles, specialties and qualifications");
    add(knowledge.services.length === 0, "hospital departments and medical services");
    add(!knowledge.contact.known.address, "hospital/clinic address");
    add(!knowledge.contact.known.phone, "hospital/clinic phone number");
    add(!knowledge.contact.known.hours, "consultation and opening hours");
    add(true, "appointment availability and time slots");
    add(true, "insurance and payment coverage");
  } else if (archetype === "hotel") {
    add(knowledge.products.length === 0, "room types, rates and amenities");
    add(!knowledge.contact.known.address, "property address");
    add(!knowledge.contact.known.phone, "property phone number");
    add(true, "check-in/check-out times and house policies");
    add(true, "room availability, booking confirmation and cancellation terms");
  } else if (archetype === "restaurant") {
    add(knowledge.products.length === 0 && knowledge.services.length === 0, "menu items and prices");
    add(!knowledge.contact.known.address, "restaurant address");
    add(!knowledge.contact.known.hours, "opening hours");
    add(true, "reservation availability");
  } else if (archetype === "ecommerce") {
    add(knowledge.products.length === 0, "product catalogue, prices and variants");
    add(knowledge.testimonials.length === 0, "customer reviews");
    add(!knowledge.policies.shipping, "shipping and delivery policy");
    add(!knowledge.policies.returns, "returns and refund policy");
  } else if (archetype === "portfolio" || archetype === "agency") {
    add(knowledge.products.length === 0 && knowledge.services.length === 0, "projects, services and outcomes");
    add(knowledge.testimonials.length === 0, "client testimonials");
    add(true, "client names, awards and performance statistics");
  }
  return unique(unknowns);
}

function assetMeaning(asset: GenerationAssetInput): string {
  const category = asset.category ?? "";
  if (category === "brand.logo" || asset.kind === "LOGO") return "official business logo";
  if (category === "media.hero") return "hero / cover photo supplied by the business";
  if (category === "media.gallery") return "gallery photo supplied by the business";
  if (category === "media.people") return "team or people photo supplied by the business";
  if (asset.kind === "VIDEO" || category === "media.video") return "video supplied by the business";
  if (asset.kind === "PHOTO") return "photo supplied by the business";
  const extension = asset.filename.split(".").pop()?.toLowerCase() ?? "";
  if (["pdf", "doc", "docx", "txt"].includes(extension)) {
    return "reference document supplied by the business (use only information that is already extracted into the facts above)";
  }
  if (["csv", "tsv", "xls", "xlsx"].includes(extension)) {
    return "structured data file supplied by the business (use only information that is already extracted into the facts above)";
  }
  return "file supplied by the business";
}

function assetTypeOf(asset: GenerationAssetInput): GenerationAssetType {
  const category = (asset.category ?? "").toLowerCase();
  const name = asset.filename.toLowerCase();
  if (category === "brand.logo" || asset.kind === "LOGO" || /logo|wordmark|brandmark/.test(name)) return "logo";
  if (category === "media.hero") return "hero_image";
  if (category === "media.people" || /team|staff|people|portrait|headshot|profile/.test(name)) return "team_photo";
  if (category === "media.gallery") return "gallery_image";
  if (asset.kind === "MENU" || /menu|dish|drink/.test(name)) return "menu";
  if (asset.kind === "VIDEO") return "video";
  if (asset.kind === "PHOTO") {
    if (category.includes("product") || /product|item|room|suite|collection/.test(name)) return "product_image";
    return "gallery_image";
  }
  if (asset.kind === "DOCUMENT" || asset.kind === "DATA") return "document";
  if (/icon|favicon/.test(name)) return "icon";
  return "other";
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function associatedEntity(
  asset: GenerationAssetInput,
  type: GenerationAssetType,
  knowledge: ProjectKnowledge,
): string {
  const file = normalized(asset.filename);
  const names = [
    ...knowledge.products.map((product) => ({ label: `product "${product.name}"`, name: product.name })),
    ...knowledge.services.map((service) => ({ label: `service "${service.name}"`, name: service.name })),
    ...knowledge.team.map((member) => ({ label: `team member "${member.name}"`, name: member.name })),
  ];
  const match = names.find((entry) => {
    const name = normalized(entry.name);
    return name.length >= 3 && (file === name || file.includes(name) || name.includes(file));
  });
  if (match) return match.label;
  if (type === "logo") return "the brand (site-wide)";
  if (type === "hero_image") return "the homepage hero";
  if (type === "product_image") return "the product catalogue";
  if (type === "team_photo" || type === "profile_photo") return "the team / people section";
  if (type === "menu") return "the menu page";
  if (type === "video") return "the media/gallery section";
  if (type === "document") return "reference material only";
  return "general site imagery";
}

function intendedPagesFor(
  type: GenerationAssetType,
  pages: Array<{ name: string; path: string }>,
  associated: string,
): string[] {
  const existing = (patterns: RegExp[]): string[] => {
    const matched = pages.filter((page) => patterns.some((pattern) => pattern.test(`${page.name} ${page.path}`))).map((page) => page.path);
    return matched.length > 0 ? matched : ["/"];
  };
  switch (type) {
    case "logo":
      return pages.map((page) => page.path);
    case "hero_image":
      return ["/"];
    case "product_image":
      return existing([/shop|catalog/, /product/, /cart|checkout/, /^home$/i, /^\/$/]);
    case "gallery_image":
      return existing([/gallery/, /work|portfolio|project/, /about/, /rooms|room detail/, /^\/$/]);
    case "team_photo":
      return existing([/team|about|people|doctor|staff/, /contact/]);
    case "profile_photo":
      return existing([/about/, /^\/$/]);
    case "menu":
      return existing([/menu/]);
    case "video":
      return existing([/gallery|media/, /^\/$/]);
    case "document":
      return existing([/about|contact|faq/]);
    default:
      if (associated.includes("product")) return existing([/shop|catalog|product/, /^\/$/]);
      return ["/"];
  }
}

function usageFor(type: GenerationAssetType, associated: string): string {
  switch (type) {
    case "logo":
      return "Use as the official logo in the navbar/footer. Do not redraw, recolour or replace it with a wordmark.";
    case "product_image":
      return `Use only as imagery for ${associated}. Never use it for a different product or as a generic lifestyle image.`;
    case "gallery_image":
      return "Use only in gallery/editorial image slots. Do not claim it depicts something it does not.";
    case "team_photo":
      return `Use only for ${associated}. Never attach it to a different person or invent a name.`;
    case "profile_photo":
      return "Use only as the person's portrait.";
    case "hero_image":
      return "Use as the homepage hero/cover image; keep text contrast accessible.";
    case "menu":
      return "Use only information already extracted into the menu facts; never invent dishes or prices from the file name.";
    case "video":
      return "Use only as supplied media; do not imply it shows something it does not.";
    case "document":
      return "Reference only. Use facts already extracted into this specification; do not invent content from the document.";
    default:
      return "Use only for the purpose described; never substitute it for a missing business fact.";
  }
}

function mapAssets(
  assets: GenerationAssetInput[] | undefined,
  knowledge: ProjectKnowledge,
  pages: Array<{ name: string; path: string }>,
): GenerationAsset[] {
  return (assets ?? [])
    .filter((asset) => asset.filename.trim())
    .map((asset) => {
      const type = assetTypeOf(asset);
      const associated = associatedEntity(asset, type, knowledge);
      return {
        filename: asset.filename.trim(),
        kind: asset.kind || "FILE",
        category: asset.category?.trim() || "",
        type,
        meaning: assetMeaning(asset),
        purpose: `${type.replace(/_/g, " ")} for ${associated}`,
        associatedEntity: associated,
        intendedPages: intendedPagesFor(type, pages, associated),
        usageInstructions: usageFor(type, associated),
        ...(asset.url ? { url: asset.url } : {}),
      };
    });
}

function sectionsForPage(
  page: { name: string; path: string },
  knowledge: ProjectKnowledge,
  commerce: boolean,
  archetype: string,
): string[] {
  const key = `${page.name} ${page.path}`.toLowerCase();
  let sections: SectionType[];
  if (archetype === "ecommerce") {
    if (page.path === "/") sections = ["Navbar", "Hero", "ProductGrid", "Features", "Testimonials", "CTA", "Footer"];
    else if (/(product)/.test(key) && !/(shop|catalog)/.test(key)) {
      sections = knowledge.products.length > 0
        ? ["Navbar", "ProductCard", "CTA", "Footer"]
        : ["Navbar", "Products", "CTA", "Footer"];
    } else if (/(shop|catalog)/.test(key)) sections = ["Navbar", "Products", "FAQ", "Footer"];
    else if (/about/.test(key)) sections = ["Navbar", "About", "Footer"];
    else if (/contact/.test(key)) sections = ["Navbar", "Contact", "Footer"];
    else if (/(shipping|delivery|returns)/.test(key)) sections = ["Navbar", "Services", "Contact", "Footer"];
    else if (/(cart|checkout)/.test(key)) sections = ["Navbar", "Products", "Contact", "Footer"];
    else sections = ["Navbar", "Hero", "Features", "Contact", "Footer"];
  } else if (page.path === "/") sections = ["Navbar", "Hero", "Features", "Services", "CTA", "Footer"];
  else if (/(doctor|team|staff|people|trainer|stylist)/.test(key)) sections = ["Navbar", "Hero", "Features", "Contact", "CTA", "Footer"];
  else if (/(department|service|treatment)/.test(key)) sections = ["Navbar", "Hero", "Services", "FAQ", "CTA", "Footer"];
  else if (/(book|appointment|reservation)/.test(key)) sections = ["Navbar", "Services", "Contact", "Footer"];
  else if (/(menu|product)/.test(key)) sections = ["Navbar", "Products", "Contact", "CTA", "Footer"];
  else if (/(shop|catalog)/.test(key)) sections = ["Navbar", "ProductGrid", "CTA", "Footer"];
  else if (/gallery/.test(key)) sections = ["Navbar", "Gallery", "Contact", "Footer"];
  else if (/(work|portfolio|project)/.test(key)) sections = ["Navbar", "Gallery", "Testimonials", "CTA", "Footer"];
  else if (/pricing/.test(key)) sections = ["Navbar", "Pricing", "FAQ", "CTA", "Footer"];
  else if (/faq/.test(key)) sections = ["Navbar", "FAQ", "CTA", "Footer"];
  else if (/about/.test(key)) sections = ["Navbar", "About", "Team", "Contact", "Footer"];
  else if (/contact/.test(key)) sections = ["Navbar", "Contact", "FAQ", "Footer"];
  else if (/blog|article|news/.test(key)) sections = ["Navbar", "Blog", "CTA", "Footer"];
  else sections = ["Navbar", "Hero", "Features", "Contact", "Footer"];
  return filterSections(sections, knowledge, { pageName: page.name, commerce });
}

function contentForPage(
  page: { name: string; path: string; purpose: string },
  knowledge: ProjectKnowledge,
): string[] {
  const key = `${page.name} ${page.path}`.toLowerCase();
  const content: string[] = [];
  if (page.path === "/") {
    content.push(`What the business does: ${knowledge.summary || "use the verified offering facts only"}`);
    if (knowledge.offerings.length > 0) content.push(`Actual offerings: ${knowledge.offerings.join(", ")}`);
    if (knowledge.targetAudience) content.push(`Audience: ${knowledge.targetAudience}`);
    if (knowledge.valueProposition) content.push(`Value proposition: ${knowledge.valueProposition}`);
  }
  if (/(doctor|team|staff|people|trainer|stylist)/.test(key)) {
    content.push(
      knowledge.team.length > 0
        ? `Only these supplied people: ${knowledge.team.map((member) => `${member.name}${member.role ? ` (${member.role})` : ""}`).join(", ")}`
        : "No people were supplied - do not invent doctors, trainers, stylists or staff.",
    );
  }
  if (/(department|service|treatment)/.test(key)) {
    content.push(
      knowledge.services.length > 0
        ? `Only these supplied services/departments: ${knowledge.services.map((service) => service.name).join(", ")}`
        : "No departments or services were supplied - do not invent medical specialties or treatments.",
    );
  }
  if (/(menu|product|shop|catalog|pricing)/.test(key)) {
    const items = [...knowledge.products, ...knowledge.services];
    content.push(
      items.length > 0
        ? `Only these supplied items and prices: ${items.map((item) => `${item.name}${item.price ? ` - ${item.price}` : ""}`).join(", ")}`
        : "No products, menu items or prices were supplied - do not invent them.",
    );
    const withOptions = knowledge.products.filter(
      (product) => product.sizes.length > 0 || product.colors.length > 0 || product.variants.length > 0,
    );
    if (withOptions.length > 0) {
      content.push(
        `Supplied product options only: ${withOptions
          .map((product) => {
            const parts = [
              product.sizes.length > 0 ? `sizes ${product.sizes.join("/")}` : "",
              product.colors.length > 0 ? `colours ${product.colors.join("/")}` : "",
              product.variants.length > 0 ? `variants ${product.variants.join("/")}` : "",
            ].filter(Boolean);
            return `${product.name} (${parts.join(", ")})`;
          })
          .join("; ")}`,
      );
    }
    const withDuration = knowledge.services.filter((service) => service.duration || service.features.length > 0);
    if (withDuration.length > 0) {
      content.push(
        `Supplied service details only: ${withDuration
          .map((service) => `${service.name}${service.duration ? ` - ${service.duration}` : ""}${service.features.length > 0 ? ` (${service.features.join(", ")})` : ""}`)
          .join("; ")}`,
      );
    }
    if (/product/.test(key)) {
      content.push("Show size, colour and variant controls only for the supplied options; never invent availability or stock.");
    }
  }
  if (/(room)/.test(key)) {
    const rooms = knowledge.products.filter((product) => /room|suite|villa|stay/i.test(`${product.name} ${product.category}`));
    content.push(
      rooms.length > 0
        ? `Only these supplied room types and rates: ${rooms.map((room) => `${room.name}${room.price ? ` - ${room.price}` : ""}`).join(", ")}`
        : "No room types or rates were supplied - do not invent rooms, rates or amenities.",
    );
    content.push("Show check-in/check-out details and house policies only when they were supplied.");
  }
  if (/(cart|checkout)/.test(key)) {
    content.push("Summarise only supplied items, prices and policies; do not claim a payment integration or live stock that is not configured.");
  }
  if (/(shipping|delivery|returns)/.test(key)) {
    content.push("Use only client-supplied shipping, delivery and returns terms; never invent charges or windows.");
  }
  if (/(amenit|facilit)/.test(key)) {
    content.push("List only amenities and facilities supplied by the client; do not add plausible hotel extras.");
  }
  if (/(work|portfolio|project|case stud)/.test(key)) {
    content.push(
      knowledge.offerings.length > 0 || knowledge.services.length > 0
        ? `Use only these supplied projects/services: ${[...knowledge.offerings, ...knowledge.services.map((service) => service.name)].join(", ")}`
        : "No project names, clients or outcomes were supplied - do not invent them.",
    );
  }
  if (/(book|appointment|reservation)/.test(key)) {
    content.push("Explain how to request an appointment or booking.");
    content.push("Show only contact details that were supplied; do not invent availability, slots or confirmation times.");
  }
  if (/gallery/.test(key)) content.push("Use only uploaded gallery photos; do not invent captions or image subjects.");
  if (/about/.test(key)) {
    content.push(
      knowledge.clientContent.about
        ? `Use the client's about text: ${knowledge.clientContent.about}`
        : "Write a short, neutral introduction from verified facts only; do not invent a founding story.",
    );
  }
  if (/contact/.test(key)) {
    const contact = knowledge.contact;
    content.push(
      contact.known.email || contact.known.phone || contact.known.address
        ? "Show only the verified contact details listed in the project facts."
        : "No contact details were supplied - show a contact form without invented email, phone, address or hours.",
    );
  }
  if (/faq/.test(key)) {
    content.push(
      knowledge.faqs.length > 0
        ? `Only these supplied FAQs: ${knowledge.faqs.map((item) => item.question).join("; ")}`
        : "No answered FAQs were supplied - omit or use an empty FAQ state rather than inventing policies.",
    );
  }
  if (content.length === 0) content.push(`Cover the page purpose: ${page.purpose || page.name}.`);
  return unique(content);
}

function componentsForPage(page: { name: string; path: string }): string[] {
  const key = `${page.name} ${page.path}`.toLowerCase();
  if (/(doctor|team|staff|people|trainer|stylist)/.test(key)) {
    return ["page header", "search or filter control", "person cards", "profile CTA", "appointment CTA"];
  }
  if (/(department|service|treatment)/.test(key)) return ["page header", "service cards", "detail CTA"];
  if (/(menu|product|shop|catalog)/.test(key)) {
    if (/product/.test(key)) {
      return ["page header", "image gallery", "product summary", "size/colour/variant controls when supplied", "add-to-cart CTA only when commerce is real"];
    }
    return ["page header", "category filter", "item grid", "item detail CTA"];
  }
  if (/(room)/.test(key)) return ["page header", "room cards or gallery", "amenities list", "rate display when supplied", "booking CTA"];
  if (/(cart|checkout)/.test(key)) return ["page header", "order summary", "supplied pricing and policies", "checkout CTA"];
  if (/(amenit|facilit)/.test(key)) return ["page header", "amenity list", "gallery", "booking CTA"];
  if (/(book|appointment|reservation)/.test(key)) return ["page header", "booking request form", "contact details"];
  if (/gallery/.test(key)) return ["page header", "responsive image gallery"];
  if (/faq/.test(key)) return ["page header", "accordion or question list"];
  if (/contact/.test(key)) return ["page header", "contact form", "verified contact details"];
  if (/pricing/.test(key)) return ["page header", "pricing comparison using supplied prices only"];
  if (page.path === "/") return ["page header", "primary CTA", "offering highlights", "navigation", "footer"];
  return ["page header", "content sections", "navigation", "footer"];
}

function sectionRequirementsForPage(
  page: { name: string; path: string },
  sections: string[],
  knowledge: ProjectKnowledge,
  requirements: Requirements,
  industry: IndustryGapAnalysis,
): string[] {
  const key = `${page.name} ${page.path}`.toLowerCase();
  const instructions: string[] = [];
  for (const section of sections) {
    switch (section) {
      case "Navbar":
        instructions.push(
          "Navbar: show the real brand name/logo, links only to generated pages, and one primary CTA that matches the page goal.",
        );
        break;
      case "Hero":
        instructions.push(
          "Hero: state what the business actually offers to the stated audience. Use a supplied hero image when available; never use unrelated stock imagery.",
        );
        break;
      case "ProductGrid":
      case "Products": {
        const count = knowledge.products.length + knowledge.services.length;
        instructions.push(
          count > 0
            ? "Catalogue: render real supplied items only. Each card needs a real name, supplied price (or no price), category and a matching or honest placeholder image."
            : "Catalogue: no items were supplied, so show an honest empty/placeholder state. Do not invent products, prices or categories.",
        );
        break;
      }
      case "ProductCard":
        instructions.push("Product spotlight: use one real supplied product and its supplied options; never invent variants or stock.");
        break;
      case "Pricing":
        instructions.push(
          knowledge.pricing.hasPricing
            ? "Pricing: use only supplied plans/prices; state billing periods and inclusions only when supplied."
            : "Pricing: no real prices were supplied. Omit the pricing table or label it as unavailable; never invent plans, discounts or currency.",
        );
        break;
      case "Services":
        instructions.push(
          knowledge.services.length > 0 || knowledge.offerings.length > 0
            ? "Services: describe only the supplied services and inclusions, with duration/price only when supplied."
            : "Services: no services were supplied. Do not invent offerings; use a neutral enquiry section instead.",
        );
        break;
      case "Gallery":
        instructions.push(
          "Gallery: use only uploaded images with accurate alt text. Do not invent captions, people or project outcomes.",
        );
        break;
      case "About":
        instructions.push(
          knowledge.clientContent.about
            ? "About: use the client's supplied about copy; do not add a founding story, mission or milestones that were not supplied."
            : "About: write a short neutral introduction from verified facts only; do not invent history, founders or values.",
        );
        break;
      case "Team":
        instructions.push(
          knowledge.team.length > 0
            ? "Team: render only the named supplied people, their roles and bios; match photos only when the filename identifies them."
            : "Team: no people were supplied. Omit the team section; never invent names, roles or portraits.",
        );
        break;
      case "Testimonials":
        instructions.push(
          knowledge.testimonials.length > 0
            ? "Testimonials: quote only supplied testimonials with their supplied attribution."
            : "Testimonials: no real quotes were supplied. Omit the section; never invent reviews.",
        );
        break;
      case "FAQ":
        instructions.push(
          knowledge.faqs.length > 0
            ? "FAQ: use only supplied question/answer pairs. Do not add plausible policies or delivery promises."
            : "FAQ: no answered questions were supplied. Use an empty state or omit the section.",
        );
        break;
      case "Contact":
        instructions.push(
          "Contact: show only verified contact details. If none were supplied, show the form without invented email, phone, address or hours.",
        );
        break;
      case "CTA":
        instructions.push("CTA: one specific action that routes to an existing page; never promise an unavailable booking, trial or checkout.");
        break;
      case "Footer":
        instructions.push("Footer: real brand name, valid internal links and only verified contact/social details.");
        break;
      case "Features":
        instructions.push(
          key.includes("amenit")
            ? "Features: list only supplied amenities/facilities; never add plausible hotel extras."
            : "Features: explain only real product/feature facts supplied by the client; no invented benefits or metrics.",
        );
        break;
      case "Blog":
        instructions.push("Blog: only render when article content was supplied; do not invent posts or authors.");
        break;
      default:
        instructions.push(`${section}: use only supplied facts and keep the section specific to this page's purpose.`);
    }
  }
  if (/(shop|product)/.test(key)) {
    instructions.push(
      "Product requirements: show image gallery, name, price only when supplied, description, and size/colour/variant controls only for supplied options.",
      "Add-to-cart is a UI affordance only; never claim live stock, payment or delivery unless the project actually supports it.",
      "Use supplied product images for the matching product; otherwise use a clearly editable image placeholder.",
    );
  }
  if (/(room|suite)/.test(key)) {
    instructions.push(
      "Room requirements: show the real room name, supplied rate, amenities and photos; link to the booking/enquiry path.",
      "Never invent availability, cancellation terms or room features.",
    );
  }
  if (/(menu)/.test(key)) {
    instructions.push(
      "Menu requirements: preserve supplied dish names, descriptions, sections and prices; never invent dishes, ingredients or dietary claims.",
    );
  }
  if (/(booking|reservation|appointment)/.test(key)) {
    instructions.push(
      "Booking requirements: explain the client's actual booking method and show only supplied contact details. Do not claim live availability or instant confirmation.",
    );
  }
  if (/(work|portfolio|project|case stud)/.test(key)) {
    instructions.push(
      "Work requirements: present only supplied projects, clients and outcomes; never invent results, logos or testimonials.",
    );
  }
  if (industry.profile.id === "clothing" && /(shop|product)/.test(key)) {
    instructions.push("Fashion requirements: make size and colour selection prominent, but only for supplied options; never imply fit or stock.");
  }
  return unique(instructions);
}

function functionalityForPage(
  page: { name: string; path: string },
  industry: IndustryGapAnalysis,
  requirements: Requirements,
): string[] {
  const key = `${page.name} ${page.path}`.toLowerCase();
  const functionality = industry.profile.functionality
    .filter((item) => {
      if (/(shop|product|cart|checkout)/.test(key)) return /catalogue|product|cart|size|search|review/i.test(item.label);
      if (/(room|booking|reservation|appointment)/.test(key)) return /booking|room|reservation|enquir/i.test(item.label);
      if (/(menu)/.test(key)) return /menu|price|categor/i.test(item.label);
      if (/(gallery|work|project)/.test(key)) return /gallery|case|project|work/i.test(item.label);
      if (/(contact|faq)/.test(key)) return /contact|faq|enquir/i.test(item.label);
      if (page.path === "/") return /catalogue|service|booking|contact|sign|gallery/i.test(item.label);
      return false;
    })
    .map((item) => item.label);
  if (requirements.features.booking && /(book|reservation|appointment)/.test(key)) functionality.push("online booking / appointment request flow");
  return unique(functionality);
}

function seoForPage(
  page: { name: string; path: string; purpose: string },
  requirements: Requirements,
  knowledge: ProjectKnowledge,
  industry: IndustryGapAnalysis,
): GenerationPageSpec["seo"] {
  const businessName = requirements.business.name || requirements.branding.brandName || knowledge.businessName;
  const location = requirements.business.location || requirements.content.contact.address;
  const focusTerms = unique([
    page.name,
    ...industry.profile.seoFocus,
    ...(location ? [location] : []),
    ...knowledge.products.slice(0, 6).map((product) => product.name),
    ...knowledge.services.slice(0, 6).map((service) => service.name),
  ]).slice(0, 10);
  return {
    titleGuidance: `${page.name}${businessName ? ` | ${businessName}` : ""}${location ? ` | ${location}` : ""}`,
    descriptionGuidance:
      page.purpose || requirements.business.productSummary || "Describe this page using verified business information only.",
    focusTerms,
  };
}

function resolveConversionPath(
  pages: Array<{ name: string; path: string }>,
  action: string,
): string {
  const needle = action.trim().toLowerCase();
  const candidates: Array<[RegExp, RegExp]> = [
    [/(book|appointment|reservation|schedule)/, /(book|appointment|reservation|schedule)/],
    [/(buy|shop|order|purchase)/, /(shop|product|cart|checkout)/],
    [/(contact|enquir|quote|call|message)/, /(contact|enquir)/],
    [/(donate|volunteer)/, /(donate|get-involved|join)/],
  ];
  if (needle) {
    for (const [actionPattern, pathPattern] of candidates) {
      if (!actionPattern.test(needle)) continue;
      const page = pages.find((entry) => pathPattern.test(`${entry.name} ${entry.path}`.toLowerCase()));
      if (page) return page.path;
    }
    const direct = pages.find(
      (entry) => entry.name.toLowerCase().includes(needle) || needle.includes(entry.name.toLowerCase()),
    );
    if (direct) return direct.path;
  }
  return pages.find((entry) => /contact/i.test(entry.name))?.path ?? pages[0]?.path ?? "/";
}

function pageCta(
  page: { name: string; path: string },
  conversionAction: string,
  pages: Array<{ name: string; path: string }>,
): { label: string; path: string } | null {
  const key = `${page.name} ${page.path}`.toLowerCase();
  if (/(book|appointment|reservation)/.test(key)) return { label: "Request an appointment", path: page.path };
  if (/(room|suite)/.test(key)) return { label: "Enquire about this room", path: resolveConversionPath(pages, "booking") };
  if (/(contact)/.test(key)) return { label: "Contact us", path: page.path };
  if (/(doctor|team|staff|people)/.test(key)) {
    return { label: "Book an appointment", path: resolveConversionPath(pages, "book appointment") };
  }
  if (/(menu|product|shop|catalog)/.test(key)) {
    return { label: "Browse the catalogue", path: page.path };
  }
  if (page.path === "/") {
    const label = conversionAction.trim() || "Get in touch";
    return { label, path: resolveConversionPath(pages, conversionAction) };
  }
  const path = resolveConversionPath(pages, conversionAction);
  if (path === page.path) return null;
  return { label: conversionAction.trim() || "Learn more", path };
}

function navigationRelations(
  page: { name: string; path: string },
  pages: Array<{ name: string; path: string }>,
): string[] {
  const relations = ["Global navigation links to this page."];
  const others = pages.filter((entry) => entry.path !== page.path);
  relations.push(`This page links back to Home (${pages.find((entry) => entry.path === "/")?.path ?? "/"}).`);
  const conversion = pages.find((entry) => /(book|appointment|contact|shop|checkout)/i.test(entry.path));
  if (conversion && conversion.path !== page.path) {
    relations.push(`Primary CTA links to ${conversion.name} (${conversion.path}).`);
  }
  if (page.path === "/") {
    relations.push(`Home links to: ${others.map((entry) => `${entry.name} (${entry.path})`).join(", ")}.`);
  }
  return relations;
}

function relevantMissingAssets(industry: IndustryGapAnalysis, key: string): string[] {
  const matches: Record<string, RegExp> = {
    logo: /./,
    hero: /(^|\/)($|home)/,
    product_photos: /(shop|product|catalog|home|\/)/,
    room_photos: /(room|suite|home|gallery)/,
    property_photos: /(room|gallery|home|amenit)/,
    work_images: /(work|portfolio|project|home)/,
    project_images: /(work|portfolio|project|home)/,
    profile_photo: /(about|home)/,
    team_photos: /(team|about|contact)/,
    food_photos: /(menu|home|gallery)/,
    menu_file: /(menu)/,
    product_screenshots: /(features|home)/,
  };
  return industry.missingAssets
    .filter((asset) => asset.importance === "required" && (matches[asset.id]?.test(key) ?? false))
    .map((asset) => `${asset.label} - ${asset.purpose}`);
}

function buildPageSpecs(input: {
  pages: Array<{ name: string; path: string; purpose: string; contentRequirements?: string[] }>;
  knowledge: ProjectKnowledge;
  requirements: Requirements;
  archetype: string;
  commerce: boolean;
  conversionAction: string;
  targetUser: string;
  assets: GenerationAsset[];
  industry: IndustryGapAnalysis;
  unknowns: string[];
}): GenerationPageSpec[] {
  return input.pages.map((page) => {
    const contentPlan = planPageContent({ name: page.name, path: page.path, purpose: page.purpose }, input.knowledge);
    const key = `${page.name} ${page.path}`.toLowerCase();
    const requiredSections = sectionsForPage(page, input.knowledge, input.commerce, input.archetype);
    const pageAssets = input.assets.filter(
      (asset) => asset.intendedPages.includes(page.path) || asset.intendedPages.includes("*"),
    );
    const relevantAssets = (pageAssets.length > 0 ? pageAssets : input.assets.filter((asset) => asset.type === "logo"))
      .slice(0, 20)
      .map(
        (asset) =>
          `${asset.filename} [${asset.type}] - ${asset.purpose}; entity: ${asset.associatedEntity}; usage: ${asset.usageInstructions}`,
      );
    const missingRequiredAssets = relevantMissingAssets(input.industry, key);
    return {
      name: page.name,
      path: page.path,
      purpose: page.purpose || `Serve the visitor's ${page.name.toLowerCase()} needs for this business.`,
      targetUser: input.targetUser,
      requiredSections,
      sectionRequirements: sectionRequirementsForPage(
        page,
        requiredSections,
        input.knowledge,
        input.requirements,
        input.industry,
      ),
      requiredContent: unique([
        ...contentForPage(page, input.knowledge),
        ...(page.contentRequirements ?? []).map((requirement) => `Page requirement: ${requirement}`),
      ]),
      requiredComponents: componentsForPage(page),
      requiredFunctionality: functionalityForPage(page, input.industry, input.requirements),
      requiredAssets: missingRequiredAssets,
      seo: seoForPage(page, input.requirements, input.knowledge, input.industry),
      cta: pageCta(page, input.conversionAction, input.pages),
      navigation: navigationRelations(page, input.pages),
      availableFacts: contentPlan.knownFacts.slice(0, 16),
      assets: relevantAssets,
      restrictions: unique([
        "Use only the facts listed for this project; do not invent missing details.",
        ...contentPlan.doNotList,
        ...input.unknowns.slice(0, 14).map((unknown) => `Do not invent: ${unknown}.`),
        ...missingRequiredAssets.map((asset) => `Required asset not supplied: ${asset}. Use an honest placeholder; do not substitute unrelated stock imagery.`),
        "Never use a supplied asset for an entity it does not depict.",
      ]),
    };
  });
}

function renderService(service: GenerationService): string {
  return `${service.name}${service.description ? ` - ${service.description}` : ""}${
    service.duration ? ` [${service.duration}]` : ""
  }${service.features.length > 0 ? ` {${service.features.join(", ")}}` : ""}${
    service.price ? ` (${service.price})` : " (price not provided)"
  }`;
}

function renderProduct(product: GenerationProduct): string {
  const options = [
    product.sizes.length > 0 ? `sizes: ${product.sizes.join("/")}` : "",
    product.colors.length > 0 ? `colours: ${product.colors.join("/")}` : "",
    product.variants.length > 0 ? `variants: ${product.variants.join("/")}` : "",
  ].filter(Boolean);
  return `${product.name}${product.category ? ` [${product.category}]` : ""}${
    product.description ? ` - ${product.description}` : ""
  }${options.length > 0 ? ` {${options.join(", ")}}` : ""}${
    product.imageUrl ? ` [image: ${product.imageUrl}]` : ""
  }${product.price ? ` (${product.price})` : " (price not provided)"}`;
}

export function designFor(
  requirements: Requirements,
  archetype: string,
  knowledge: ProjectKnowledge,
): GenerationDesign {
  const branding = requirements.branding;
  const changeText = requirements.website.changeRequests.join(" ").toLowerCase();
  const requestedStyle = /\bdarker\b|dark mode|dark theme/.test(changeText)
    ? "darker, higher-contrast visual treatment"
    : /\blighter\b|brighter/.test(changeText)
      ? "lighter, airy visual treatment"
      : /\bminimal/.test(changeText)
        ? "minimal visual treatment with restrained chrome"
        : /\bbolder\b|more bold/.test(changeText)
          ? "bolder typography and stronger visual hierarchy"
          : "";
  const domainStyle: Record<string, string> = {
    healthcare: "calm, professional healthcare interface with clear appointment CTAs",
    hotel: "calm, spacious hospitality design with room-led photography",
    restaurant: "warm, appetite-led hospitality design",
    ecommerce: "clean product-led store design",
    portfolio: "editorial portfolio design that lets the work lead",
    agency: "confident studio design with clear service positioning",
    saas: "clear product-led interface with strong hierarchy",
    business: "professional service-business design",
  };
  return {
    style:
      [branding.style.trim() || domainStyle[archetype] || "modern, domain-appropriate design", requestedStyle]
        .filter(Boolean)
        .join("; "),
    mood: [requirements.website.toneOfVoice.trim() || "professional and approachable", requestedStyle]
      .filter(Boolean)
      .join("; "),
    tone: requirements.website.toneOfVoice.trim() || "clear, specific and human",
    layout: "responsive layout with a clear hierarchy, generous spacing and consistent section rhythm",
    imageryDirection:
      knowledge.products.length > 0 || knowledge.services.length > 0
        ? "Use uploaded business photos where they exist; never substitute unrelated stock imagery for real products or people."
        : "Use uploaded business photos where they exist; otherwise use restrained geometric or typographic treatments rather than unrelated stock photos.",
    animation: "Subtle transitions only; no gratuitous motion; respect prefers-reduced-motion.",
    colors: {
      primary: branding.primaryColor.trim(),
      secondary: branding.secondaryColor.trim(),
      accent: branding.accentColor.trim(),
      background: "",
      foreground: "",
    },
    typography: {
      headingFont: branding.fontPreference.trim(),
      bodyFont: branding.fontPreference.trim(),
    },
    references: [],
  };
}

/**
 * Builds the structured website specification for exactly one project.
 */
export function buildWebsiteSpecification(
  input: BuildGenerationSpecificationInput,
): WebsiteGenerationSpecification {
  const { project, requirements } = input;
  const projectId = project.id.trim();
  const archetype = inferArchetype(requirements, input.plan);

  // Isolation guard: a knowledge object from another project is a bug, not
  // context. Refuse it rather than allowing cross-project contamination.
  if (input.knowledge?.projectId && projectId && input.knowledge.projectId !== projectId) {
    throw new Error(
      `Project isolation violation: knowledge for "${input.knowledge.projectId}" cannot be used for project "${projectId}".`,
    );
  }

  const knowledge =
    input.knowledge ??
    buildProjectKnowledge(requirements, {
      projectId,
      archetype,
      requiredPages: input.plan?.pages.map((page) => page.name) ?? requirements.website.requiredPages,
      userJourneys: input.plan?.userJourneys,
      extraFacts: input.extraFacts,
    });

  const corrections = clientCorrections(requirements, input.conversation);
  const pages = pagesFor(
    requirements,
    archetype,
    input.plan,
    corrections.onlyTerms,
    corrections.requests,
  );
  const businessName = project.businessName.trim() || knowledge.businessName || project.name.trim();
  const targetAudience = requirements.business.targetAudience.trim() || knowledge.targetAudience;
  const purpose =
    requirements.website.purpose.trim() ||
    requirements.business.productSummary.trim() ||
    requirements.business.description.trim() ||
    knowledge.summary;
  const commerce = requirements.features.ecommerce || requirements.features.payments;
  const industry = analyzeIndustryGaps(requirements, {
    assets: input.assets ?? [],
    pages,
    extraFacts: input.extraFacts,
    archetype,
  });
  const assets = mapAssets(input.assets, knowledge, pages);
  const domainExclusions = DOMAIN_EXCLUSIONS[archetype] ?? DOMAIN_EXCLUSIONS.custom ?? [];
  const explicitExclusions = unique([
    ...domainExclusions,
    "any page that is not listed in REQUIRED PAGES",
    "content, images or concepts from another Luvify project",
    ...corrections.exclusions.map((exclusion) => `explicitly excluded by the client: ${exclusion}`),
    ...corrections.onlyTerms.map((term) => `anything outside the client's explicit scope: only ${term}`),
    ...(commerce ? [] : ["shopping cart, checkout or online payments unless they appear in the approved page list"]),
  ]);

  const enabledFeatures = Object.entries(requirements.features)
    .filter(([key, value]) => key !== "reviewed" && value === true)
    .map(([key]) => FEATURE_LABELS[key] ?? key);
  const impliedFeatures: string[] = [];
  for (const page of pages) {
    const key = `${page.name} ${page.path}`.toLowerCase();
    if (/(book|appointment|reservation)/.test(key)) impliedFeatures.push("appointment / booking request flow");
    if (/(doctor|team|staff|people)/.test(key)) impliedFeatures.push("directory of supplied people with profiles");
    if (/(menu|product|shop|catalog)/.test(key)) impliedFeatures.push("browsable catalogue of supplied items");
    if (/gallery/.test(key)) impliedFeatures.push("gallery of supplied photos");
    if (/(faq)/.test(key)) impliedFeatures.push("frequently asked questions from supplied answers");
  }
  const requiredFunctionality = unique([
    ...enabledFeatures,
    ...impliedFeatures,
    ...industry.profile.functionality.filter((item) => item.importance === "required").map((item) => item.label),
  ]);

  const unknowns = unique([
    ...knowledge.unknowns,
    ...domainUnknowns(archetype, knowledge),
    ...industry.missingRequiredInformation.map((item) => item.label),
    "any business fact that does not appear in USER-PROVIDED FACTS",
  ]);

  const conversionAction = requirements.website.conversionAction.trim();
  const allRoutes = pages.map((page) => ({ label: page.name, path: page.path }));
  const detailPattern = /\/(profile|product|rental|listing|item)\b/i;
  const primaryNavigation = allRoutes.filter((route) => !detailPattern.test(route.path));
  const ctaRoutes: Array<{ label: string; path: string; from: string }> = [];
  for (const page of pages) {
    const cta = pageCta(page, conversionAction, pages);
    if (cta) ctaRoutes.push({ label: cta.label, path: cta.path, from: page.path });
  }
  const design = designFor(requirements, archetype, knowledge);
  const inferredDesignDecisions = unique([
    `Page architecture: ${pages.map((page) => `${page.name} (${page.path})`).join(", ")}.`,
    `Visual direction: ${design.style}.`,
    `Layout: ${design.layout}.`,
    `Imagery direction: ${design.imageryDirection}.`,
    "Responsive behaviour: mobile-first, single-column content on small screens, accessible navigation.",
    "Palette and typography choices are design decisions; they are not factual business claims.",
  ]);
  const factClassification = {
    providedFacts: unique([
      ...knowledge.knownFacts,
      ...(targetAudience ? [`Target audience: ${targetAudience}`] : []),
      ...(knowledge.clientContent.about ? [`About: ${knowledge.clientContent.about}`] : []),
    ]).slice(0, 100),
    inferredDesignDecisions,
    missingInformation: unique([
      ...unknowns,
      ...industry.missingRequiredInformation.map((item) => item.label),
      ...industry.missingRecommendedInformation.map((item) => item.label),
    ]).slice(0, 100),
  };

  return {
    promptVersion: GENERATION_PROMPT_VERSION,
    project: {
      id: projectId,
      name: project.name.trim(),
      websiteType: project.websiteType.trim() || requirements.website.type.trim(),
      industry: requirements.business.industry.trim(),
      purpose,
      targetAudience,
      archetype,
      archetypeLabel: archetypeLabel(archetype),
    },
    business: {
      name: businessName,
      description: requirements.business.description.trim(),
      tagline: requirements.content.subheadline.trim(),
      valueProposition: requirements.business.valueProposition.trim() || knowledge.valueProposition,
      offerings: knowledge.offerings,
      services: knowledge.services.map((service) => ({
        name: service.name,
        description: service.description,
        price: service.price,
        duration: service.duration,
        features: service.features,
      })),
      products: knowledge.products.map((product) => ({
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
        sizes: product.sizes,
        colors: product.colors,
        variants: product.variants,
        imageUrl: product.imageUrl,
      })),
      contact: {
        email: knowledge.contact.known.email ? knowledge.contact.email : "",
        phone: knowledge.contact.known.phone ? knowledge.contact.phone : "",
        address: knowledge.contact.known.address ? knowledge.contact.address : "",
        hours: knowledge.contact.known.hours ? knowledge.contact.hours : "",
      },
    },
    userProvidedFacts: unique([
      ...knowledge.knownFacts,
      ...(knowledge.clientContent.about ? [`About: ${knowledge.clientContent.about}`] : []),
      ...(knowledge.clientContent.headline ? [`Headline: ${knowledge.clientContent.headline}`] : []),
      ...(knowledge.clientContent.subheadline ? [`Subheadline: ${knowledge.clientContent.subheadline}`] : []),
      ...(targetAudience ? [`Target audience: ${targetAudience}`] : []),
    ]).slice(0, 80),
    userRequests: unique([
      requirements.website.primaryGoal.trim(),
      requirements.website.purpose.trim(),
      conversionAction,
      ...requirements.website.requiredPages.map((page) => `Requested page: ${page}`),
      ...enabledFeatures.map((feature) => `Requested functionality: ${feature}`),
      ...corrections.requests.map((message) => `Client correction: ${message}`),
    ]),
    userPreferences: unique([
      requirements.website.toneOfVoice.trim(),
      requirements.branding.style.trim(),
      requirements.branding.fontPreference.trim(),
      requirements.branding.primaryColor.trim() ? `Primary colour: ${requirements.branding.primaryColor.trim()}` : "",
      requirements.branding.secondaryColor.trim() ? `Secondary colour: ${requirements.branding.secondaryColor.trim()}` : "",
      requirements.branding.accentColor.trim() ? `Accent colour: ${requirements.branding.accentColor.trim()}` : "",
      requirements.branding.existingAssets.trim(),
    ]),
    requiredFunctionality,
    industry: {
      profile: industry.profile.label,
      profileId: industry.profile.id,
      confidence: industry.confidence,
      requiredInformation: industry.profile.requiredInformation,
      missingRequiredInformation: industry.missingRequiredInformation,
      missingRecommendedInformation: industry.missingRecommendedInformation,
      missingPages: unique([...industry.missingRequiredPages.map((page) => page.name), ...industry.missingRecommendedPages.map((page) => page.name)]),
      missingAssets: industry.missingAssets,
      designNotes: industry.profile.designNotes,
      seoFocus: industry.profile.seoFocus,
    },
    factClassification,
    design,
    inferredStructure: pages.map((page) => `${page.name} (${page.path}): ${page.purpose || "supports the user journey"}`),
    pages: buildPageSpecs({
      pages,
      knowledge,
      requirements,
      archetype,
      commerce,
      conversionAction,
      targetUser: targetAudience || PAGE_TARGET_USERS[archetype] || PAGE_TARGET_USERS.custom || "Visitors",
      assets,
      industry,
      unknowns,
    }),
    navigation: {
      primary: primaryNavigation,
      allRoutes,
      ctaRoutes,
    },
    assets,
    constraints: unique([
      `Use only information belonging to project id "${projectId}".`,
      "The latest explicit user correction outranks the approved specification, which outranks the original requirements, which outranks domain defaults.",
      "Do not generate content, images or concepts from any other project.",
      "Do not add pages outside REQUIRED PAGES.",
      "Do not present invented information as a factual business claim.",
      "Every internal link and CTA must route to one of the generated pages.",
      "Missing information is not permission to invent factual business information.",
    ]),
    explicitExclusions,
    unknowns,
    contentRules: CONTENT_RULES,
    userProvidedContent: {
      headline: knowledge.clientContent.headline,
      subheadline: knowledge.clientContent.subheadline,
      about: knowledge.clientContent.about,
      galleryNotes: requirements.content.galleryNotes.trim(),
      socials: Object.entries(requirements.content.socials)
        .filter(([, url]) => hasValue(url))
        .map(([network, url]) => ({ network, url })),
    },
    changeRequests: unique([
      ...requirements.website.changeRequests,
      ...corrections.requests.filter((message) => !requirements.website.changeRequests.includes(message)),
    ]),
    contentGaps: unique([
      ...knowledge.contentGaps,
      ...(pages.some((page) => /(book|appointment|reservation)/i.test(page.path)) && knowledge.contact.known.phone === false && knowledge.contact.known.email === false
        ? ["Contact details for booking enquiries"]
        : []),
    ]),
    responsiveRequirements: RESPONSIVE_REQUIREMENTS,
    accessibilityRequirements: ACCESSIBILITY_REQUIREMENTS,
    ctaRequirements: CTA_REQUIREMENTS,
    imageRequirements: IMAGE_REQUIREMENTS,
    crossPageConsistency: CROSS_PAGE_CONSISTENCY,
  };
}

/** Human-readable prompt block for the specification (no system instructions). */
export function renderGenerationSpecification(
  spec: WebsiteGenerationSpecification,
  options: { focusPagePath?: string } = {},
): string {
  const contact = spec.business.contact;
  const contactLines = [
    contact.email ? `Email: ${contact.email}` : "",
    contact.phone ? `Phone: ${contact.phone}` : "",
    contact.address ? `Address: ${contact.address}` : "",
    contact.hours ? `Hours: ${contact.hours}` : "",
  ].filter(Boolean);

  const pageBlocks = spec.pages.map((page, index) => {
    const marker = options.focusPagePath === page.path ? " (CURRENT PAGE TO WRITE)" : "";
    return [
      `${index + 1}. ${page.name.toUpperCase()}${marker}`,
      `Path: ${page.path}`,
      `Purpose: ${page.purpose}`,
      `Target user: ${page.targetUser}`,
      `Required sections: ${list(page.requiredSections)}`,
      `Section requirements:\n${bullet(page.sectionRequirements)}`,
      `Required content:\n${bullet(page.requiredContent)}`,
      `Required components: ${list(page.requiredComponents)}`,
      `Required functionality: ${list(page.requiredFunctionality, "No page-specific functionality.")}`,
      `Primary CTA: ${page.cta ? `${page.cta.label} -> ${page.cta.path}` : "none"}`,
      `Navigation relationships:\n${bullet(page.navigation)}`,
      `Available facts:\n${bullet(page.availableFacts, "No page-specific facts; use only the global facts above.")}`,
      `Assets to use:\n${bullet(page.assets, "No assets assigned to this page.")}`,
      `Required assets still missing (use honest placeholders):\n${bullet(page.requiredAssets, "None for this page.")}`,
      `SEO title guidance: ${page.seo.titleGuidance}`,
      `SEO description guidance: ${page.seo.descriptionGuidance}`,
      `SEO focus terms (only when supported by facts): ${list(page.seo.focusTerms)}`,
      `Restrictions:\n${bullet(page.restrictions)}`,
    ].join("\n");
  });

  return [
    `LUVIFY WEBSITE GENERATION SPECIFICATION`,
    `PROMPT VERSION: ${spec.promptVersion}`,
    "",
    "PROJECT",
    `ID: ${spec.project.id}`,
    `Name: ${spec.project.name}`,
    `Business name: ${spec.business.name}`,
    `Website type: ${spec.project.websiteType || "unspecified"}`,
    `Website archetype: ${spec.project.archetype} (${spec.project.archetypeLabel})`,
    `Industry: ${spec.project.industry || "not provided"}`,
    `PRIMARY OBJECTIVE: ${spec.project.purpose || "not provided"}`,
    `TARGET AUDIENCE: ${spec.project.targetAudience || "not provided"}`,
    "",
    "INDUSTRY REQUIREMENTS",
    `Profile: ${spec.industry.profile} (${spec.industry.profileId}; ${spec.industry.confidence})`,
    `Expected information:\n${bullet(spec.industry.requiredInformation.map((item) => `${item.label} [${item.importance}]`))}`,
    `Missing required information (must NOT be invented):\n${bullet(
      spec.industry.missingRequiredInformation.map((item) => `${item.label}${item.guidance ? ` - ${item.guidance}` : ""}`),
      "None - all required information was supplied.",
    )}`,
    `Missing recommended information:\n${bullet(spec.industry.missingRecommendedInformation.map((item) => item.label), "None.")}`,
    `Expected but missing pages (do NOT add them unless the approved page list contains them):\n${bullet(spec.industry.missingPages, "None.")}`,
    `Missing assets:\n${bullet(spec.industry.missingAssets.map((item) => `${item.label} - ${item.purpose}`), "None.")}`,
    `Industry design guidance:\n${bullet(spec.industry.designNotes)}`,
    `SEO focus:\n${bullet(spec.industry.seoFocus)}`,
    "",
    "BUSINESS INFORMATION",
    `Description: ${spec.business.description || "not provided"}`,
    `Tagline: ${spec.business.tagline || "not provided"}`,
    `Value proposition: ${spec.business.valueProposition || "not provided"}`,
    `Offerings: ${list(spec.business.offerings)}`,
    `Services:\n${bullet(spec.business.services.map(renderService), "No services supplied.")}`,
    `Products:\n${bullet(spec.business.products.map(renderProduct), "No products supplied.")}`,
    `Verified contact details:\n${bullet(contactLines, "None supplied - do not invent any contact details.")}`,
    "",
    "USER-PROVIDED FACTS (the only permitted source of factual business information)",
    bullet(spec.factClassification.providedFacts, "No factual business data was supplied. Do not invent any."),
    "",
    "FACT CLASSIFICATION",
    "Provided facts are the only permitted source of factual business claims.",
    `Inferred design decisions (permitted, but they are not business facts):\n${bullet(spec.factClassification.inferredDesignDecisions)}`,
    `Missing information (must stay missing or use an editable placeholder):\n${bullet(spec.factClassification.missingInformation, "None recorded; still do not invent any fact not listed above.")}`,
    "",
    "USER REQUESTS",
    bullet(spec.userRequests, "No explicit requests were recorded beyond the website type."),
    "",
    "USER PREFERENCES",
    bullet(spec.userPreferences, "No explicit brand or tone preferences were supplied."),
    "",
    "USER-PROVIDED CONTENT",
    `Headline: ${spec.userProvidedContent.headline || "not provided"}`,
    `Subheadline: ${spec.userProvidedContent.subheadline || "not provided"}`,
    `About: ${spec.userProvidedContent.about || "not provided"}`,
    `Gallery notes: ${spec.userProvidedContent.galleryNotes || "not provided"}`,
    `Social profiles: ${list(spec.userProvidedContent.socials.map((social) => `${social.network}: ${social.url}`))}`,
    "",
    "LATEST USER CORRECTIONS (highest priority)",
    bullet(spec.changeRequests, "No user corrections recorded."),
    "",
    "REQUIRED PAGES (generate exactly these pages)",
    spec.pages.map((page) => `- ${page.name} (${page.path})`).join("\n"),
    "",
    "PAGE-BY-PAGE REQUIREMENTS",
    pageBlocks.join("\n\n"),
    "",
    "FUNCTIONAL REQUIREMENTS",
    bullet(spec.requiredFunctionality, "No additional functionality was requested."),
    "",
    "NAVIGATION REQUIREMENTS",
    `Primary navigation:\n${bullet(spec.navigation.primary.map((item) => `${item.label} -> ${item.path}`))}`,
    `All generated routes:\n${bullet(spec.navigation.allRoutes.map((item) => `${item.label} -> ${item.path}`))}`,
    `CTA routes:\n${bullet(spec.navigation.ctaRoutes.map((item) => `${item.label} -> ${item.path} (from ${item.from})`), "No CTA routes required.")}`,
    "Every navigation item must route to the matching generated page. Do not create disconnected pages.",
    "",
    "CROSS-PAGE CONSISTENCY REQUIREMENTS",
    bullet(spec.crossPageConsistency),
    "",
    "CTA REQUIREMENTS",
    bullet(spec.ctaRequirements),
    "",
    "IMAGE REQUIREMENTS",
    bullet(spec.imageRequirements),
    "",
    "DESIGN REQUIREMENTS",
    `Style: ${spec.design.style}`,
    `Mood: ${spec.design.mood}`,
    `Tone of voice: ${spec.design.tone}`,
    `Layout: ${spec.design.layout}`,
    `Imagery direction: ${spec.design.imageryDirection}`,
    `Animation: ${spec.design.animation}`,
    `Colors: ${[
      spec.design.colors.primary ? `primary ${spec.design.colors.primary}` : "",
      spec.design.colors.secondary ? `secondary ${spec.design.colors.secondary}` : "",
      spec.design.colors.accent ? `accent ${spec.design.colors.accent}` : "",
    ].filter(Boolean).join(", ") || "no brand colours supplied - choose a restrained, domain-appropriate palette"}`,
    `Typography: ${
      spec.design.typography.headingFont || spec.design.typography.bodyFont
        ? `${spec.design.typography.headingFont || spec.design.typography.bodyFont} headings / ${spec.design.typography.bodyFont || spec.design.typography.headingFont} body`
        : "no font preference supplied - use a legible, professional pairing"
    }`,
    `References: ${list(spec.design.references, "none supplied")}`,
    "",
    "REAL ASSETS AND ASSET MAPPING",
    bullet(
      spec.assets.map(
        (asset) =>
          `${asset.filename} [${asset.type}; kind ${asset.kind}${asset.category ? `; category ${asset.category}` : ""}] -> ${asset.meaning}\n  Purpose: ${asset.purpose}\n  Entity: ${asset.associatedEntity}\n  Pages: ${asset.intendedPages.join(", ") || "none"}\n  Usage: ${asset.usageInstructions}`,
      ),
      "No assets were uploaded. Do not imply that photos or documents exist.",
    ),
    "Use each asset only for what it actually represents. Never assign an asset to an unrelated section or entity and never use another project's assets.",
    "",
    "CONTENT REQUIREMENTS",
    bullet(spec.contentRules),
    "",
    "STRICT CONTENT RULES",
    "User-provided facts are the only factual source. Missing information is NOT permission to invent factual business information.",
    "Do not fabricate people, departments, products, prices, availability, policies, statistics, awards, testimonials, addresses, phone numbers or opening hours.",
    "If something is unknown, omit it, write around it, or use a clearly editable placeholder - never a fabricated value.",
    "",
    "EXPLICIT EXCLUSIONS - DO NOT GENERATE",
    bullet(spec.explicitExclusions),
    "",
    "UNKNOWN INFORMATION - DO NOT INVENT",
    bullet(spec.unknowns, "No unknowns recorded; still do not invent any fact not listed above."),
    "",
    "CONTENT GAPS",
    bullet(spec.contentGaps, "No content gaps recorded."),
    "",
    "RESPONSIVE REQUIREMENTS",
    bullet(spec.responsiveRequirements),
    "On mobile: single-column content, no horizontal overflow, readable product/room cards, accessible menu and 44px tap targets.",
    "",
    "ACCESSIBILITY REQUIREMENTS",
    bullet(spec.accessibilityRequirements),
    "",
    "CONSTRAINTS",
    bullet(spec.constraints),
  ].join("\n");
}

/** The complete detailed prompt sent to the website-generation model. */
export function buildGenerationPrompt(
  spec: WebsiteGenerationSpecification,
  options: { focusPagePath?: string } = {},
): string {
  return [
    renderGenerationSpecification(spec, options),
    "",
    "GENERATION REQUIREMENTS",
    bullet(GENERATION_REQUIREMENTS),
  ].join("\n");
}

export interface GenerationPromptPair {
  system: string;
  user: string;
  version: string;
}

/** System + user prompt pair for providers that use chat messages. */
export function buildGenerationPromptPair(
  spec: WebsiteGenerationSpecification,
  options: { focusPagePath?: string } = {},
): GenerationPromptPair {
  return {
    system: [
      "You are Luvify's website generation model.",
      "You receive a complete, project-specific website specification and generate only what it supports.",
      "Never invent factual business information, never reuse another project's content, and never add pages or functionality that the specification excludes.",
      "User-provided facts are the only permitted factual source; unknowns must stay unknown.",
    ].join("\n"),
    user: buildGenerationPrompt(spec, options),
    version: spec.promptVersion,
  };
}

export interface SpecificationValidation {
  ok: boolean;
  issues: string[];
  warnings: string[];
}

/** Quality control before the specification reaches the website model. */
export function validateWebsiteSpecification(spec: WebsiteGenerationSpecification): SpecificationValidation {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!spec.project.id.trim()) issues.push("project id is missing");
  if (!spec.project.websiteType.trim()) warnings.push("website type is missing");
  if (!spec.project.purpose.trim() && !spec.business.description.trim() && !spec.business.valueProposition.trim()) {
    issues.push("business purpose/summary is missing");
  }
  if (spec.pages.length === 0) issues.push("no required pages are defined");
  if (!spec.pages.some((page) => page.path === "/")) issues.push("the required pages do not include a home page at /");
  if (spec.navigation.primary.length === 0) issues.push("primary navigation is not defined");
  if (spec.navigation.allRoutes.length !== spec.pages.length) issues.push("navigation does not cover every required page");
  if (spec.explicitExclusions.length === 0) issues.push("explicit exclusions are not defined");
  if (spec.contentRules.length === 0) issues.push("content rules are not defined");
  if (spec.responsiveRequirements.length === 0) issues.push("responsive requirements are not defined");
  if (spec.accessibilityRequirements.length === 0) issues.push("accessibility requirements are not defined");
  if (spec.ctaRequirements.length === 0) issues.push("CTA requirements are not defined");
  if (spec.imageRequirements.length === 0) issues.push("image requirements are not defined");
  if (spec.crossPageConsistency.length === 0) issues.push("cross-page consistency requirements are not defined");
  if (spec.userProvidedFacts.length === 0) warnings.push("no user-provided facts were recorded");
  if (!spec.project.targetAudience.trim()) warnings.push("target audience is missing");
  if (!spec.business.description.trim() && spec.userProvidedFacts.length > 0) warnings.push("business description is missing");
  if (spec.assets.length === 0) warnings.push("no project assets were supplied");
  if (spec.unknowns.length === 0) warnings.push("no unknowns were recorded");
  if (!spec.industry.profileId) issues.push("industry profile is missing");
  if (!spec.factClassification) issues.push("fact classification is missing");
  if (spec.factClassification?.providedFacts.length === 0) warnings.push("no provided facts were classified");
  if (spec.factClassification?.missingInformation.length === 0) warnings.push("no missing information was classified");
  for (const page of spec.pages) {
    if (page.sectionRequirements.length === 0) issues.push(`page ${page.path} has no section requirements`);
    if (!page.seo.titleGuidance.trim()) warnings.push(`page ${page.path} has no SEO title guidance`);
  }

  return { ok: issues.length === 0, issues, warnings };
}

export interface GeneratedDocumentValidation {
  ok: boolean;
  issues: string[];
  warnings: string[];
}

/**
 * Structural validation of the generated website against its approved
 * specification. Content grounding is handled separately by
 * `validateDocument`; this pass prevents missing pages, required sections,
 * dead navigation or broken CTA routes from being saved silently.
 */
export function validateGeneratedDocument(
  spec: WebsiteGenerationSpecification,
  document: SiteDocument,
): GeneratedDocumentValidation {
  const issues: string[] = [];
  const warnings: string[] = [];
  const generatedByPath = new Map(document.pages.map((page) => [page.path, page]));
  const generatedPaths = new Set(document.pages.map((page) => page.path));

  if (document.pages.length === 0) issues.push("generated document contains no pages");
  for (const required of spec.pages) {
    const page = generatedByPath.get(required.path);
    if (!page) {
      issues.push(`required page is missing from the generated document: ${required.name} (${required.path})`);
      continue;
    }
    if (page.sections.length === 0) issues.push(`${required.path} was generated with no sections`);
    const types = new Set(page.sections.map((section) => section.type));
    // The document renders navigation and footer globally. A page does not
    // need a local copy to satisfy the planned chrome requirement.
    if ((document.navigation ?? []).length > 0) types.add("Navbar" as SectionType);
    if (document.footer?.visible === true) types.add("Footer" as SectionType);
    // Templates own the concrete section vocabulary. Products and ProductGrid
    // are equivalent catalogue renderers, so either satisfies the plan.
    if (types.has("Products")) types.add("ProductGrid" as SectionType);
    if (types.has("ProductGrid")) types.add("Products" as SectionType);
    // Missing planned sections are surfaced for review, but page presence and
    // routing are the blocking contract.
    for (const section of required.requiredSections) {
      if (!types.has(section as SectionType)) {
        warnings.push(`${required.path} is missing planned section type ${section}`);
      }
    }
    if (required.cta && !generatedPaths.has(required.cta.path) && !/^https?:\/\//i.test(required.cta.path)) {
      issues.push(`${required.path} CTA routes to a page that was not generated: ${required.cta.path}`);
    }
    if (required.requiredAssets.length > 0) {
      warnings.push(`${required.path} has ${required.requiredAssets.length} missing required asset(s); placeholders must remain honest`);
    }
  }

  for (const page of document.pages) {
    if (!spec.pages.some((required) => required.path === page.path)) {
      warnings.push(`generated document contains a page outside the approved list: ${page.path}`);
    }
  }
  for (const link of document.navigation) {
    const path = link.path.trim();
    if (!path || path === "#" || path.startsWith("http") || path.startsWith("mailto:") || path.startsWith("tel:")) continue;
    if (!generatedPaths.has(path)) issues.push(`navigation link points to a missing page: ${path}`);
  }
  for (const cta of spec.navigation.ctaRoutes) {
    if (!generatedPaths.has(cta.path)) issues.push(`CTA route points to a missing page: ${cta.label} -> ${cta.path}`);
  }

  return { ok: issues.length === 0, issues, warnings };
}
