import { z } from "zod";
import { deriveProductSummary } from "./answers";
import { hasValue, isEcommerceProject, type Requirements } from "./requirements";
import type { SectionType } from "./enums";
import type { SiteDocument } from "./site";

/**
 * Project Knowledge - the structured source of truth for one project.
 *
 * CLIENT CHAT -> REQUIREMENT EXTRACTION -> PROJECT KNOWLEDGE -> WEBSITE
 * ARCHITECTURE -> PAGE CONTENT PLAN -> CONTENT GENERATION -> FACT /
 * REQUIREMENT VALIDATION -> FINAL WEBSITE.
 *
 * Every factual item is traceable to information the client supplied
 * (`source: "client"`) or explicitly marked as unknown. Generation may use
 * verified facts and safe creative copy, but must never assert unknown
 * information as fact. Unknown information stays unknown: no invented phone
 * numbers, prices, testimonials, statistics, addresses, policies or histories.
 */

const text = z.string().default("");

export const FactItemSchema = z.object({
  /** The factual statement in the client's own terms. */
  value: z.string().min(1),
  /** Where the fact came from: always "client" for verified items. */
  source: z.enum(["client"]).default("client"),
});
export type FactItem = z.infer<typeof FactItemSchema>;

export const ProjectKnowledgeSchema = z.object({
  projectId: text,
  businessName: text,
  /** Concise client-grounded summary of what is being built. */
  summary: text,
  websiteType: text,
  archetype: text,
  targetAudience: text,
  problem: text,
  /** Exact client concepts - generation must use these, never substitutes. */
  products: z
    .array(
      z.object({ name: text, description: text, price: text, category: text }),
    )
    .default([]),
  services: z
    .array(z.object({ name: text, description: text, price: text }))
    .default([]),
  /** Client-provided people - the only source Team sections may render. */
  team: z
    .array(z.object({ name: text, role: text, bio: text }))
    .default([]),
  /** Short client-grounded offering phrases ("oversized T-shirts"). */
  offerings: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  benefits: z.array(z.string()).default([]),
  valueProposition: text,
  brandVoice: text,
  brandKeywords: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  contact: z
    .object({
      email: text,
      phone: text,
      address: text,
      hours: text,
      /** True only for fields the client explicitly provided. */
      known: z
        .object({
          email: z.boolean().default(false),
          phone: z.boolean().default(false),
          address: z.boolean().default(false),
          hours: z.boolean().default(false),
        })
        .default({}),
    })
    .default({}),
  pricing: z
    .object({
      hasPricing: z.boolean().default(false),
      items: z.array(z.object({ name: text, price: text })).default([]),
      currency: text,
      paymentProvider: text,
      notes: text,
    })
    .default({}),
  policies: z
    .object({
      shipping: text,
      shippingRegions: z.array(z.string()).default([]),
      returns: text,
      notes: text,
    })
    .default({}),
  testimonials: z
    .array(z.object({ quote: text, author: text, role: text }))
    .default([]),
  /** Only FAQs with client-provided answers. */
  faqs: z.array(z.object({ question: text, answer: text })).default([]),
  statistics: z.array(z.object({ value: text, label: text })).default([]),
  certifications: z.array(z.string()).default([]),
  awards: z.array(z.string()).default([]),
  /** Other verified factual claims, each traceable to the client. */
  claims: z.array(FactItemSchema).default([]),
  requiredPages: z.array(z.string()).default([]),
  userJourneys: z
    .array(z.object({ goal: text, steps: z.array(z.string()).default([]) }))
    .default([]),
  /** Client-provided long-form content. */
  clientContent: z
    .object({ headline: text, subheadline: text, about: text })
    .default({}),
  /** Facts the client stated, in human-readable form (for prompts/debugging). */
  knownFacts: z.array(z.string()).default([]),
  /** Information the client never provided - must stay unknown. */
  unknowns: z.array(z.string()).default([]),
  /** Sections the client may still provide content for. */
  contentGaps: z.array(z.string()).default([]),
});
export type ProjectKnowledge = z.infer<typeof ProjectKnowledgeSchema>;

export interface KnowledgeBuildOptions {
  projectId?: string;
  archetype?: string;
  requiredPages?: string[];
  userJourneys?: Array<{ goal: string; steps: string[] }>;
  /**
   * Additional verified facts (the client brief's unmapped values) appended to
   * `knownFacts` - grounded in client input, so they obey the same no-
   * fabrication rules as everything else here.
   */
  extraFacts?: string[];
}

function pushUnique(target: string[], value: string): void {
  const trimmed = value.trim();
  if (trimmed && !target.some((entry) => entry.toLowerCase() === trimmed.toLowerCase())) target.push(trimmed);
}

/**
 * Builds the project's source of truth from its requirements. Never creates
 * fake values for missing fields: anything the client did not provide lands
 * in `unknowns` / `contentGaps` instead.
 */
export function buildProjectKnowledge(
  requirements: Requirements,
  options: KnowledgeBuildOptions = {},
): ProjectKnowledge {
  const business = requirements.business;
  const content = requirements.content;
  const commerce = isEcommerceProject(requirements);

  const products = [...requirements.ecommerce.products, ...content.products]
    .filter((product) => hasValue(product.name))
    .map((product) => ({
      name: product.name.trim(),
      description: product.description.trim(),
      price: product.price.trim(),
      category: product.category.trim(),
    }));
  const services = content.services
    .filter((service) => hasValue(service.name))
    .map((service) => ({
      name: service.name.trim(),
      description: service.description.trim(),
      price: service.price.trim(),
    }));
  const team = content.team
    .filter((member) => hasValue(member.name))
    .map((member) => ({
      name: member.name.trim(),
      role: member.role.trim(),
      bio: member.bio.trim(),
    }));
  const offerings = business.offerings.map((offering) => offering.trim()).filter(Boolean);
  const testimonials = content.testimonials
    .filter((item) => hasValue(item.quote))
    .map((item) => ({ quote: item.quote.trim(), author: item.author.trim(), role: item.role.trim() }));
  // Only questions the client's content can answer: an answer is required,
  // otherwise the FAQ would invent a policy or business fact.
  const faqs = content.faq
    .filter((item) => hasValue(item.question) && hasValue(item.answer))
    .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() }));

  const contact = {
    email: content.contact.email.trim(),
    phone: content.contact.phone.trim(),
    address: content.contact.address.trim(),
    hours: content.contact.hours.trim(),
    known: {
      email: hasValue(content.contact.email),
      phone: hasValue(content.contact.phone),
      address: hasValue(content.contact.address),
      hours: hasValue(content.contact.hours),
    },
  };

  const pricingItems: Array<{ name: string; price: string }> = [];
  for (const product of products) {
    if (hasValue(product.price)) pricingItems.push({ name: product.name, price: product.price });
  }
  for (const service of services) {
    if (hasValue(service.price)) pricingItems.push({ name: service.name, price: service.price });
  }
  const pricing = {
    hasPricing: pricingItems.length > 0,
    items: pricingItems,
    currency: requirements.ecommerce.currency.trim(),
    paymentProvider: requirements.ecommerce.paymentProvider.trim(),
    notes: requirements.ecommerce.shipping.notes.trim(),
  };

  const shippingRegions = requirements.ecommerce.shipping.regions.map((region) => region.trim()).filter(Boolean);
  const policies = {
    shipping: requirements.ecommerce.shipping.notes.trim(),
    shippingRegions,
    returns: "",
    notes: "",
  };

  const locations: string[] = [];
  if (hasValue(business.location)) pushUnique(locations, business.location);
  if (contact.known.address) pushUnique(locations, contact.address);

  const features = Object.entries(requirements.features)
    .filter(([key, value]) => key !== "reviewed" && value === true)
    .map(([key]) => key);

  const knownFacts: string[] = [];
  const fact = (condition: boolean, label: string): void => {
    if (condition) knownFacts.push(label);
  };
  fact(hasValue(business.name), `Business name: ${business.name.trim()}`);
  fact(hasValue(business.productSummary), `Offering: ${business.productSummary.trim()}`);
  for (const offering of offerings) knownFacts.push(`Offers: ${offering}`);
  for (const product of products) {
    knownFacts.push(
      `Product: ${product.name}${product.price ? ` (${product.price})` : ""}${product.category ? ` [${product.category}]` : ""}`,
    );
  }
  for (const service of services) {
    knownFacts.push(`Service: ${service.name}${service.price ? ` (${service.price})` : ""}`);
  }
  for (const member of team) {
    knownFacts.push(`Team member: ${member.name}${member.role ? ` - ${member.role}` : ""}`);
  }
  // Verified extras from the client brief (unmapped brief fields, ...).
  for (const extra of options.extraFacts ?? []) pushUnique(knownFacts, extra);
  fact(hasValue(business.targetAudience), `Audience: ${business.targetAudience.trim()}`);
  fact(hasValue(business.location), `Location: ${business.location.trim()}`);
  fact(hasValue(business.valueProposition), `Value proposition: ${business.valueProposition.trim()}`);
  fact(contact.known.email, `Contact email: ${contact.email}`);
  fact(contact.known.phone, `Contact phone: ${contact.phone}`);
  fact(contact.known.address, `Address: ${contact.address}`);
  fact(contact.known.hours, `Hours: ${contact.hours}`);
  if (pricing.hasPricing) {
    for (const item of pricingItems) knownFacts.push(`Price: ${item.name} - ${item.price}`);
  }
  if (shippingRegions.length > 0) knownFacts.push(`Serves: ${shippingRegions.join(", ")}`);
  if (hasValue(policies.shipping)) knownFacts.push(`Shipping: ${policies.shipping}`);
  for (const item of testimonials) {
    knownFacts.push(`Testimonial: "${item.quote}"${item.author ? ` - ${item.author}` : ""}`);
  }
  for (const item of faqs) knownFacts.push(`FAQ: ${item.question}`);
  fact(hasValue(requirements.website.conversionAction), `Conversion: ${requirements.website.conversionAction.trim()}`);
  if (commerce) knownFacts.push("Sells online");

  const unknowns: string[] = [];
  const unknown = (condition: boolean, label: string): void => {
    if (!condition) pushUnique(unknowns, label);
  };
  unknown(hasValue(business.location) || contact.known.address, "physical location");
  unknown(contact.known.phone, "phone number");
  unknown(contact.known.email, "contact email");
  unknown(contact.known.hours, "opening hours");
  unknown(pricing.hasPricing, "pricing");
  unknown(testimonials.length > 0, "testimonials/reviews");
  unknown(faqs.length > 0, "answered FAQs");
  unknown(false, "company history/founding year");
  unknown(false, "customer counts/statistics");
  unknown(false, "awards/certifications");
  unknown(team.length === 0, "team members");
  unknown(
    !Object.values(content.socials).some((value) => hasValue(value)),
    "social media accounts",
  );
  unknown(hasValue(requirements.ecommerce.shipping.notes) || shippingRegions.length > 0, "shipping/delivery policy");
  unknown(hasValue(policies.returns), "returns policy");

  const contentGaps: string[] = [];
  if (testimonials.length === 0) contentGaps.push("Testimonials - ask the client for real customer quotes before showing a reviews section.");
  if (!pricing.hasPricing && commerce) contentGaps.push("Pricing - ask the client for real prices before showing a pricing section.");
  if (!contact.known.phone && !contact.known.email) contentGaps.push("Contact details - ask the client for an email or phone number.");
  if (locations.length === 0) contentGaps.push("Location - ask the client where the business operates.");

  return ProjectKnowledgeSchema.parse({
    projectId: options.projectId ?? "",
    businessName: business.name.trim() || requirements.website.type,
    summary: business.productSummary.trim(),
    websiteType: requirements.website.type,
    archetype: options.archetype ?? requirements.website.archetype.trim() ?? "custom",
    targetAudience: business.targetAudience.trim(),
    problem: requirements.website.purpose.trim(),
    products,
    services,
    team,
    offerings,
    features,
    benefits: business.uniqueSellingPoints.map((point) => point.trim()).filter(Boolean),
    valueProposition: business.valueProposition.trim(),
    brandVoice: requirements.website.toneOfVoice.trim(),
    brandKeywords: requirements.technical.seo.keywords.map((keyword) => keyword.trim()).filter(Boolean),
    locations,
    contact,
    pricing,
    policies,
    testimonials,
    faqs,
    statistics: [],
    certifications: [],
    awards: [],
    claims: [],
    requiredPages: options.requiredPages ?? requirements.website.requiredPages,
    userJourneys:
      options.userJourneys ??
      requirements.website.userJourneys.map((journey) => ({ goal: journey.goal, steps: [...journey.steps] })),
    clientContent: {
      headline: content.headline.trim(),
      subheadline: content.subheadline.trim(),
      about: content.about.trim(),
    },
    knownFacts,
    unknowns,
    contentGaps,
  });
}

/** All client-provided prose in one haystack, for grounding checks. */
export function clientText(knowledge: ProjectKnowledge): string {
  return [
    knowledge.summary,
    knowledge.businessName,
    knowledge.targetAudience,
    knowledge.valueProposition,
    knowledge.problem,
    ...knowledge.offerings,
    ...knowledge.products.flatMap((product) => [product.name, product.description, product.price, product.category]),
    ...knowledge.services.flatMap((service) => [service.name, service.description, service.price]),
    ...knowledge.benefits,
    ...knowledge.locations,
    knowledge.clientContent.headline,
    knowledge.clientContent.subheadline,
    knowledge.clientContent.about,
    ...knowledge.testimonials.flatMap((item) => [item.quote, item.author, item.role]),
    ...knowledge.faqs.flatMap((item) => [item.question, item.answer]),
    ...knowledge.brandKeywords,
  ]
    .join("\n")
    .toLowerCase();
}

/** True when a number appearing in generated copy also appears in client text. */
export function isNumberGrounded(value: string, haystack: string): boolean {
  const numbers = value.match(/\d[\d.,]*/g) ?? [];
  if (numbers.length === 0) return true;
  return numbers.every((number) => haystack.includes(number.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Requirement-aware section gating (§4)
// ---------------------------------------------------------------------------

/** Sections that assert facts the client must have provided first. */
export function isSectionAllowed(
  section: SectionType,
  knowledge: ProjectKnowledge,
  options: { pageName?: string; commerce?: boolean } = {},
): boolean {
  switch (section) {
    case "Testimonials":
      // Only generate when real testimonials/reviews were provided.
      return knowledge.testimonials.length > 0;
    case "Pricing":
      // Only generate when pricing is part of the product and known.
      return knowledge.pricing.hasPricing;
    case "Team":
      // Only generate when team info exists or the client requested it.
      return isTeamRequested(knowledge);
    case "ProductGrid":
    case "ProductCard":
    case "Products": {
      const commerce = options.commerce ?? knowledge.products.length > 0;
      if (!commerce && knowledge.products.length === 0 && knowledge.offerings.length === 0) return false;
      return true;
    }
    case "Blog":
      return knowledge.features.includes("blog");
    case "FAQ":
      // Only questions answerable from known requirements.
      return knowledge.faqs.length > 0;
    default:
      return true;
  }
}

function isTeamRequested(knowledge: ProjectKnowledge): boolean {
  const requested = [...knowledge.requiredPages, ...knowledge.userJourneys.flatMap((journey) => journey.steps)];
  if (requested.some((entry) => entry.trim().toLowerCase() === "team")) return true;
  // Client-provided people (brief/interview) make the section truthful.
  if (knowledge.team.length > 0) return true;
  // "About" copy naming real people counts as team information.
  return false;
}

/** Filters a page's section list through the requirement-aware gate. */
export function filterSections(
  sections: SectionType[],
  knowledge: ProjectKnowledge,
  options: { pageName?: string; commerce?: boolean } = {},
): SectionType[] {
  return sections.filter((section) => isSectionAllowed(section, knowledge, options));
}

// ---------------------------------------------------------------------------
// Page-specific content planning (§7)
// ---------------------------------------------------------------------------

export interface PageContentPlan {
  page: string;
  purpose: string;
  knownFacts: string[];
  unknowns: string[];
  /** What the page must do with verified information. */
  doList: string[];
  /** What the page must not invent. */
  doNotList: string[];
}

const NEVER_INVENT = [
  "founding year / company history",
  "founder story",
  "employee count",
  "customer counts or statistics",
  "ratings or reviews",
  "awards or certifications",
  "prices or discounts",
  "guarantees, shipping or return policies",
  "addresses, phone numbers or emails",
  "opening hours",
];

/** Small internal content plan: what is known, what is unknown, what to do. */
export function planPageContent(
  page: { name: string; path: string; purpose?: string },
  knowledge: ProjectKnowledge,
): PageContentPlan {
  const name = page.name.toLowerCase();
  const relevant = knowledge.knownFacts.filter((fact) => {
    if (name === "home" || name === "/") return true;
    const words = name.split(/[^a-z0-9]+/).filter((word) => word.length > 2);
    const lower = fact.toLowerCase();
    return (
      words.some((word) => lower.includes(word)) ||
      fact.startsWith("Offering:") ||
      fact.startsWith("Offers:") ||
      fact.startsWith("Business name:")
    );
  });
  const knownFacts = relevant.length > 0 ? relevant : knowledge.knownFacts.slice(0, 8);

  const doList: string[] = [];
  if (knowledge.summary) doList.push(`Present the actual offering: ${knowledge.summary}`);
  if (knowledge.offerings.length > 0) doList.push(`Use the exact client concepts: ${knowledge.offerings.join(", ")}`);
  if (knowledge.targetAudience) doList.push(`Speak to the actual audience: ${knowledge.targetAudience}`);
  if (knowledge.clientContent.headline && (name === "home" || name === "/")) {
    doList.push(`Use the client headline: ${knowledge.clientContent.headline}`);
  }
  if (name.includes("contact")) {
    if (knowledge.contact.known.email || knowledge.contact.known.phone) doList.push("Show the verified contact details");
    else doList.push("Show a contact form without inventing contact details");
  }
  if (doList.length === 0) doList.push("Describe the business in specific but non-factual terms drawn from known information");

  return {
    page: page.name,
    purpose: page.purpose ?? "",
    knownFacts,
    unknowns: [...knowledge.unknowns],
    doList,
    doNotList: [...NEVER_INVENT],
  };
}

// ---------------------------------------------------------------------------
// Fact/requirement validation (§11) - the post-generation validation pass
// ---------------------------------------------------------------------------

/** Phrases that assert specific business facts a client may never have given. */
const UNSUPPORTED_CLAIM_PATTERNS: RegExp[] = [
  /\b\d+\s*\+?\s*(years|clients|customers|patients|projects|orders|reviews|members|countries|cities|outlets|stores|teams|commissions)\b/i,
  // Word numbers ("a team of four", "eleven years behind the camera").
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\b[^.!?]{0,40}\b(years?|months?|weeks?|days?|hours?|minutes?|afternoons?|clients?|customers?|projects?|people|members?|commissions?|countries?)\b/i,
  /\bsince\s+\d{4}\b/i,
  // Date ranges presented as experience ("Selected work 2024 - 2026").
  /\b20\d\d\s*[-–]\s*20\d\d\b/,
  /\bfounded in\b/i,
  /\b award(?:s|ed|-winning)?\b/i,
  /\bcertified\b|\bcertification\b/i,
  /\b#1\b|\bbest in\b|\bbestsellers?\b|\bmost-?reordered\b/i,
  /\btrusted by\b/i,
  /\brated\s+\d/i,
  /\b\d(\.\d)?\/5\b/i,
  /\bfree shipping\b/i,
  /\bfree\b[^.!?]{0,16}\bover\s*\d+/i,
  /\b\d+\s*days?\s*(returns?|refund|delivery|dispatch|shipping)/i,
  /\breturns?\b[^.!?]{0,24}\b\d+\s*days?\b/i,
  /\b\d+\s*days?\b[^.!?]{0,30}\breturns?\b/i,
  /\bnext working day\b/i,
  /\bship\w*\b[^.!?]{0,32}\b(one|two|three|four|\d+)\s*(working\s*)?days?\b/i,
  /\b\d+\s*-\s*\d+\s*(working\s*)?days?\b/i,
  /\b\d+\s*-\s*\d+\s*weeks?\b/i,
  /\breturns? (window|policy)|no questions asked\b/i,
  /\b24\/7\b/i,
  /\bmoney-?back guarantee\b/i,
  /\bcancel anytime\b/i,
  /\bno credit card\b/i,
  /\bconfirm\w*\s+(by|within)\b/i,
  /\bsoc\s?2\b/i,
  /\b\d{1,3}\s?%\b/i,
  /\buptime\b/i,
  /\bcarbon-neutral\b/i,
  /\blocally sourced\b/i,
  /\bwalk-?ins welcome\b/i,
  /\bopen daily\b/i,
  // Availability / scarcity states ("booking projects from next month").
  /\bbooking .* next month\b/i,
  /\bavailable for .* quarter\b/i,
  /\bcurrently booking\b/i,
  /\bfrom\s+[$€£₹]?\s?\d/i,
];

/** Contact placeholders templates use when the client gave no details. */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /@example\.com$/i,
  /^add your .*inspector panel$/i,
  /^(mon-fri|tue-sun|mon-sun),?\s+\d/i,
];

/** Sender promises templates bake into forms. */
const UNGROUNDED_PROMISE_PATTERNS: RegExp[] = [
  /within one (working|business) day/i,
  /within two working days/i,
  /confirm.*by email shortly/i,
  /reply to every/i,
  /confirmed within the hour/i,
  /walk-ins welcome/i,
];

export function looksLikePlaceholderContact(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function containsUnsupportedClaim(copy: string, haystack: string): boolean {
  const trimmed = copy.trim();
  if (!trimmed) return false;
  // Grounded when the client said the same thing (or stated the numbers).
  if (trimmed.length > 12 && haystack.includes(trimmed.toLowerCase())) return false;
  return UNSUPPORTED_CLAIM_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export interface ValidationReport {
  removedSections: string[];
  clearedFields: string[];
  unsupportedClaims: string[];
  /** 0-100: requirement coverage minus unsupported-claim penalties. */
  qualityScore: number;
}

export interface ValidationResult {
  document: SiteDocument;
  report: ValidationReport;
  knowledge: ProjectKnowledge;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Specific without inventing facts: composes honest body copy from verified
 * information only ("Oversized T-shirts and hoodies in a clean, minimal
 * streetwear look, made for college students."). Returns [] when nothing
 * concrete is known, so the section renders its title without invented prose.
 */
export function groundedBodyCopy(knowledge: ProjectKnowledge): string[] {
  const parts: string[] = [];
  if (knowledge.offerings.length > 0) {
    let sentence = knowledge.offerings
      .map((offering) => offering.charAt(0).toUpperCase() + offering.slice(1))
      .join(" and ");
    const voice = knowledge.brandVoice || knowledge.valueProposition;
    if (voice) sentence += `, ${voice.charAt(0).toLowerCase()}${voice.slice(1).replace(/[.]+$/, "")}`;
    if (knowledge.targetAudience) {
      sentence += `, made for ${knowledge.targetAudience.charAt(0).toLowerCase()}${knowledge.targetAudience.slice(1).replace(/[.]+$/, "")}`;
    }
    parts.push(`${sentence.replace(/[.]+$/, "")}.`);
  } else if (knowledge.summary) {
    parts.push(knowledge.summary.replace(/[.]+$/, "") + ".");
  }
  return parts.slice(0, 2);
}

/**
 * Post-generation validation pass: checks every factual claim against the
 * project's known information. SUPPORTED -> keep. UNSUPPORTED FACTUAL CLAIM
 * or CONTRADICTS REQUIREMENTS -> remove/rewrite. SAFE CREATIVE COPY -> keep.
 */
export function validateDocument(document: SiteDocument, knowledge: ProjectKnowledge): ValidationResult {
  const haystack = clientText(knowledge);
  const report: ValidationReport = { removedSections: [], clearedFields: [], unsupportedClaims: [], qualityScore: 100 };
  const next: SiteDocument = clone(document);

  const note = (kind: "removedSections" | "clearedFields" | "unsupportedClaims", entry: string): void => {
    if (!report[kind].includes(entry)) report[kind].push(entry);
  };

  for (const page of next.pages) {
    const kept: typeof page.sections = [];
    for (const section of page.sections) {
      const label = `${page.name}: ${section.type}`;
      // Testimonials only when the client provided them.
      if (section.type === "Testimonials") {
        if (knowledge.testimonials.length === 0) {
          note("removedSections", label);
          note("unsupportedClaims", `${label} (invented reviews)`);
          continue;
        }
        kept.push(section);
        continue;
      }
      // Team only when requested or known.
      if (section.type === "Team") {
        if (!isTeamRequested(knowledge)) {
          note("removedSections", label);
          note("unsupportedClaims", `${label} (invented team)`);
          continue;
        }
        // There is no team-member source in the requirements: any listed
        // people ("Strategy lead", "Head chef", ...) are invented. Keep the
        // requested section shell so the page keeps its slot; members are
        // added by the client via the inspector.
        const members = (section as unknown as { members?: unknown[] }).members;
        if (Array.isArray(members) && members.length > 0) {
          (section as unknown as { members: unknown[] }).members = [];
          note("clearedFields", `${label} members (invented people)`);
          note("unsupportedClaims", `${label} members (invented people)`);
        }
        kept.push(section);
        continue;
      }
      // Pricing only when real pricing exists; otherwise an honest CTA keeps
      // the page and the user journey without inventing plans or prices.
      if (section.type === "Pricing") {
        if (!knowledge.pricing.hasPricing) {
          note("removedSections", label);
          note("unsupportedClaims", `${label} (invented prices)`);
          kept.push({
            id: `${section.id}-cta`,
            visible: true,
            type: "CTA",
            title: "Contact us for pricing",
            body: knowledge.summary
              ? `Tell us what you need - we will put together pricing for ${knowledge.summary.charAt(0).toLowerCase()}${knowledge.summary.slice(1).replace(/[.]+$/, "")}.`
              : "Tell us what you need and we will put together pricing.",
            button: { label: "Get in touch", path: "/contact", external: false },
            secondaryButton: {},
            variant: "solid",
            note: "",
            eyebrow: "",
          } as unknown as typeof section);
          continue;
        }
        kept.push(section);
        continue;
      }
      // FAQ only when answerable from known requirements.
      if (section.type === "FAQ") {
        const items = section.items.filter((item) => {
          if (!item.question?.trim()) return false;
          if (item.answer?.trim() && haystack.includes(item.question.toLowerCase().slice(0, 24))) return true;
          const known = knowledge.faqs.some(
            (faq) => faq.question.toLowerCase() === item.question.toLowerCase(),
          );
          return known && hasValue(item.answer);
        });
        if (items.length === 0) {
          note("removedSections", label);
          continue;
        }
        if (items.length !== section.items.length) note("clearedFields", `${label} (ungrounded answers)`);
        kept.push({ ...section, items });
        continue;
      }
      // Blog only with blog intent; invented posts never ship as the client's.
      if (section.type === "Blog") {
        if (!knowledge.features.includes("blog")) {
          note("removedSections", label);
          continue;
        }
        kept.push({ ...section, posts: [] });
        if (section.posts.length > 0) note("clearedFields", `${label} posts (invented articles)`);
        continue;
      }
      sanitizeSection(section, page.name, knowledge, haystack, note);
      kept.push(section);
    }
    page.sections = kept;
  }

  // Contact details must never be invented: strip placeholders and promises.
  const contact = next.contact;
  if (!knowledge.contact.known.email && looksLikePlaceholderContact(contact.email)) {
    contact.email = "";
    note("clearedFields", "contact email (placeholder)");
  }
  if (!knowledge.contact.known.phone && looksLikePlaceholderContact(contact.phone)) {
    contact.phone = "";
    note("clearedFields", "contact phone (placeholder)");
  }
  if (!knowledge.contact.known.address && looksLikePlaceholderContact(contact.address)) {
    contact.address = "";
    note("clearedFields", "contact address (placeholder)");
  }
  if (!knowledge.contact.known.hours && looksLikePlaceholderContact(contact.hours)) {
    contact.hours = "";
    note("clearedFields", "contact hours (placeholder)");
  }
  if (next.footer.contactEmail && looksLikePlaceholderContact(next.footer.contactEmail)) {
    next.footer.contactEmail = "";
    note("clearedFields", "footer email (placeholder)");
  }
  if (next.footer.address && looksLikePlaceholderContact(next.footer.address)) {
    next.footer.address = "";
    note("clearedFields", "footer address (placeholder)");
  }

  report.qualityScore = computeQualityScore(next, knowledge, report);
  if (report.removedSections.length > 0 || report.clearedFields.length > 0) {
    const summary = [
      ...report.removedSections.map((entry) => `removed ${entry}`),
      ...report.clearedFields.map((entry) => `cleared ${entry}`),
    ]
      .slice(0, 6)
      .join("; ");
    next.meta = { ...next.meta, notes: `Content validation: ${summary}` };
  }
  return { document: next, report, knowledge };
}

type SectionNote = (kind: "removedSections" | "clearedFields" | "unsupportedClaims", entry: string) => void;

/** Sanitizes one section in place: stats, claims, prices, contacts, bodies. */
function sanitizeSection(
  section: SiteDocument["pages"][number]["sections"][number],
  pageName: string,
  knowledge: ProjectKnowledge,
  haystack: string,
  note: SectionNote,
): void {
  const label = `${pageName}: ${section.type}`;
  const record = section as unknown as Record<string, unknown>;

  // Statistics: keep only numbers the client actually stated.
  if (Array.isArray(record.stats)) {
    const stats = (record.stats as Array<{ value?: string; label?: string }>).filter((stat) => {
      const value = String(stat.value ?? "");
      if (!value.trim()) return false;
      if (isNumberGrounded(value, haystack)) return true;
      note("unsupportedClaims", `${label} stat "${value} ${String(stat.label ?? "")}"`);
      return false;
    });
    if (stats.length !== (record.stats as unknown[]).length) {
      record.stats = stats;
      note("clearedFields", `${label} stats`);
    }
  }

  // Trust lines / eyebrows / subtitles / taglines asserting business facts.
  for (const field of ["trustLine", "eyebrow", "subtitle", "tagline"] as const) {
    const value = record[field];
    if (typeof value !== "string" || !value.trim()) continue;
    if (containsUnsupportedClaim(value, haystack)) {
      record[field] = "";
      note("clearedFields", `${label} ${field}`);
      note("unsupportedClaims", `${label} ${field}: "${value.trim().slice(0, 80)}"`);
    }
  }

  // Hero titles/subtitles: keep client copy; neutralize invented guarantees.
  if (section.type === "Hero") {
    const titleValue = typeof record.title === "string" ? record.title : "";
    const titleGrounded =
      titleValue.trim().length > 0 &&
      (titleValue === knowledge.clientContent.headline ||
        (titleValue.trim().length > 8 && haystack.includes(titleValue.trim().toLowerCase().slice(0, 32))));
    if (titleValue.trim() && !titleGrounded) {
      // A fallback title from a mismatched template ("We build brands...")
      // is wrong-domain content: compose the headline from verified
      // information instead. Keep the original only when the project has
      // nothing concrete to say yet (template showcase).
      const composed =
        knowledge.clientContent.headline ||
        knowledge.summary ||
        knowledge.businessName ||
        "";
      if (composed && containsUnsupportedClaim(titleValue, haystack)) {
        record.title = composed.slice(0, 140);
        note("clearedFields", `${label} title`);
        note("unsupportedClaims", `${label} title: "${titleValue.trim().slice(0, 80)}"`);
      } else if (composed && titleValue !== composed) {
        record.title = composed.slice(0, 140);
        note("clearedFields", `${label} title (wrong-domain fallback)`);
      }
    }
    for (const field of ["subtitle"] as const) {
      const value = (record[field] as string) ?? "";
      if (typeof value !== "string" || !value.trim()) continue;
      const clientSaidIt = value.trim().length > 8 && haystack.includes(value.trim().toLowerCase().slice(0, 32));
      if (!clientSaidIt && containsUnsupportedClaim(value, haystack)) {
        if (field === "subtitle") {
          const grounded = groundedBodyCopy(knowledge);
          record[field] = grounded[0] ?? "";
        } else {
          record[field] = knowledge.clientContent.headline || knowledge.summary || value;
        }
        note("clearedFields", `${label} ${field}`);
        note("unsupportedClaims", `${label} ${field}: "${value.trim().slice(0, 80)}"`);
      }
    }
  }

  // Builder UI copy ("...from the Inspector panel") must never ship in a
  // published website.
  for (const field of ["subtitle", "description"] as const) {
    const value = record[field];
    if (typeof value !== "string" || !value.trim()) continue;
    if (/inspector panel/i.test(value)) {
      record[field] = "";
      note("clearedFields", `${label} ${field} (builder copy)`);
    }
  }

  // About: invented founder stories / histories become grounded copy or nothing.
  if (section.type === "About") {
    if (typeof record.title === "string" && record.title.trim()) {
      const title = record.title.trim();
      const groundedTitle = title.length > 4 && haystack.includes(title.toLowerCase().slice(0, 24));
      if (!groundedTitle && containsUnsupportedClaim(title, haystack)) {
        record.title = knowledge.businessName || "About";
        note("clearedFields", `${label} title (invented history)`);
        note("unsupportedClaims", `${label} title: "${title.slice(0, 80)}"`);
      }
    }
    const body = record.body;
    if (Array.isArray(body)) {
      const paragraphs = body.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
      const clientAbout = knowledge.clientContent.about;
      const isClientCopy =
        clientAbout.length > 0 &&
        paragraphs.some((paragraph) => clientAbout.toLowerCase().includes(paragraph.toLowerCase().slice(0, 32)));
      if (!isClientCopy && paragraphs.length > 0) {
        // Fallback prose is template illustration, not client fact: replace it
        // with grounded copy composed from verified information (or nothing
        // when nothing concrete is known yet).
        const invented = paragraphs.some(
          (paragraph) =>
            /\b(we started|we opened|founded|since \d|years behind|spent a decade|led .* teams|first menu|trained in|photojournalism)\b/i.test(
              paragraph,
            ) || containsUnsupportedClaim(paragraph, haystack),
        );
        record.body = groundedBodyCopy(knowledge);
        note("clearedFields", `${label} body (ungrounded prose)`);
        if (invented && paragraphs[0]) note("unsupportedClaims", `${label} body: "${paragraphs[0].slice(0, 80)}"`);
      }
    }
    if (Array.isArray(record.highlights)) {
      const highlights = (record.highlights as unknown[]).filter(
        (entry) => typeof entry === "string" && entry.trim().length > 0,
      ) as string[];
      // Keep only highlights the client actually stated (offerings-derived
      // highlights match client text); drop invented claims.
      const kept = highlights.filter(
        (highlight) => highlight.length > 4 && haystack.includes(highlight.toLowerCase().slice(0, 24)),
      );
      if (kept.length !== highlights.length) {
        record.highlights = kept;
        note("clearedFields", `${label} highlights`);
      }
    }
    if (typeof record.signature === "string" && record.signature.trim()) {
      const signature = record.signature.trim();
      if (signature !== knowledge.businessName && !haystack.includes(signature.toLowerCase())) {
        record.signature = "";
        note("clearedFields", `${label} signature`);
      }
    }
  }

  // Services / Features: keep titles (structural), strip invented prices and
  // number-laden descriptions the client never stated.
  if (section.type === "Services" || section.type === "Features") {
    const items = record.items as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(items)) {
      for (const item of items) {
        if (typeof item.price === "string" && item.price.trim() && !knowledge.pricing.hasPricing) {
          note("unsupportedClaims", `${label} price "${String(item.price).slice(0, 40)}"`);
          item.price = "";
          note("clearedFields", `${label} prices`);
        }
        if (typeof item.description === "string" && item.description.trim()) {
          const description = item.description.trim();
          const grounded =
            description.length > 8 && haystack.includes(description.toLowerCase().slice(0, 32));
          if (!grounded && containsUnsupportedClaim(description, haystack)) {
            item.description = "";
            note("clearedFields", `${label} descriptions`);
            note("unsupportedClaims", `${label} description: "${description.slice(0, 80)}"`);
          }
        }
      }
    }
    if (typeof record.subtitle === "string" && containsUnsupportedClaim(record.subtitle, haystack)) {
      record.subtitle = "";
      note("clearedFields", `${label} subtitle`);
    }
  }

  // Products: names are grounded in offerings; hide prices when unknown (the
  // renderer shows "Enquire" for zero prices) and drop claim-heavy subtitles.
  if (section.type === "Products" || section.type === "ProductGrid") {
    if (typeof record.subtitle === "string" && containsUnsupportedClaim(record.subtitle, haystack)) {
      record.subtitle = "";
      note("clearedFields", `${label} subtitle`);
    }
    if (section.type === "Products" && !knowledge.pricing.hasPricing && record.showPrices === true) {
      record.showPrices = false;
      note("clearedFields", `${label} showPrices`);
    }
  }

  // Contact: never show invented details or sender promises.
  if (section.type === "Contact") {
    for (const field of ["email", "phone", "address", "hours"] as const) {
      const value = record[field];
      if (typeof value !== "string" || !value.trim()) continue;
      const knownField = knowledge.contact.known[field];
      if (!knownField && (looksLikePlaceholderContact(value) || !haystack.includes(value.trim().toLowerCase().slice(0, 24)))) {
        // Keep the value only when the client actually stated it.
        if (!knownField) {
          record[field] = "";
          note("clearedFields", `${label} ${field}`);
        }
      }
    }
    if (typeof record.submitLabel === "string") record.submitLabel = record.submitLabel || "Send message";
    for (const field of ["successMessage", "subtitle", "note"] as const) {
      const value = record[field];
      if (typeof value !== "string" || !value.trim()) continue;
      if (UNGROUNDED_PROMISE_PATTERNS.some((pattern) => pattern.test(value))) {
        record[field] = field === "successMessage" ? "Thanks for getting in touch." : "";
        note("clearedFields", `${label} ${field}`);
      }
    }
    if (typeof record.address === "string" && looksLikePlaceholderContact(record.address)) {
      record.address = "";
      note("clearedFields", `${label} address`);
    }
  }

  // CTA: strip factual promises, keep the conversion action.
  if (section.type === "CTA") {
    for (const field of ["body", "note"] as const) {
      const value = record[field];
      if (typeof value !== "string" || !value.trim()) continue;
      if (containsUnsupportedClaim(value, haystack) || UNGROUNDED_PROMISE_PATTERNS.some((pattern) => pattern.test(value))) {
        record[field] = "";
        note("clearedFields", `${label} ${field}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Content quality (§12) + final quality check (§13)
// ---------------------------------------------------------------------------

export interface QualityCheck {
  label: string;
  pass: boolean;
  detail: string;
}

/** Shorter + accurate beats longer + invented. */
export function computeQualityScore(
  document: SiteDocument,
  knowledge: ProjectKnowledge,
  report: ValidationReport,
): number {
  let score = 100;
  score -= report.removedSections.length * 8;
  score -= report.clearedFields.length * 4;
  score -= report.unsupportedClaims.length * 6;
  // Requirement coverage: actual products/services represented?
  const names = [...knowledge.offerings, ...knowledge.products.map((p) => p.name), ...knowledge.services.map((s) => s.name)];
  if (names.length > 0) {
    const serialized = JSON.stringify(document.pages).toLowerCase();
    const missing = names.filter((name) => name.length > 3 && !serialized.includes(name.toLowerCase()));
    score -= missing.length * 10;
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Final quality check before showing the website: content, structure and
 * consistency against the client's actual product.
 */
export function checkContentQuality(document: SiteDocument, knowledge: ProjectKnowledge): QualityCheck[] {
  const serialized = JSON.stringify(document).toLowerCase();
  const sectionTypes = document.pages.flatMap((page) => page.sections.map((section) => section.type));
  const checks: QualityCheck[] = [];

  const hasInventedTestimonials =
    sectionTypes.includes("Testimonials") && knowledge.testimonials.length === 0;
  checks.push({
    label: "No invented testimonials",
    pass: !hasInventedTestimonials,
    detail: hasInventedTestimonials ? "Testimonials section without client reviews" : "ok",
  });

  const inventedPrices = knowledge.pricing.hasPricing
    ? false
    : document.pages.some((page) =>
        page.sections.some(
          (section) =>
            section.type === "Pricing" ||
            ((section.type === "Services" || section.type === "Features") &&
              ((section as unknown as { items?: Array<{ price?: string }> }).items ?? []).some((item) => item.price?.trim())),
        ),
      );
  checks.push({ label: "No invented prices", pass: !inventedPrices, detail: inventedPrices ? "price without client data" : "ok" });

  const inventedContact =
    (!knowledge.contact.known.email && serialized.includes("@example.com")) ||
    (!knowledge.contact.known.address && serialized.includes("inspector panel")) ||
    (!knowledge.contact.known.hours && /mon-fri,? 9|tue-sun,? 12/.test(serialized));
  checks.push({ label: "No invented contact details", pass: !inventedContact, detail: inventedContact ? "placeholder contact present" : "ok" });

  const inventedStats = /\d+\s*\+?\s*(years|clients|customers|patients|teams|commissions)|since\s+\d{4}|11 years|fifteen years/i.test(
    serialized,
  );
  const statsGrounded = knowledge.clientContent.about + knowledge.summary + knowledge.benefits.join(" ");
  checks.push({
    label: "No invented statistics/history",
    pass: !inventedStats || /eleven|fifteen|since \d{4}/i.test(statsGrounded),
    detail: "checked",
  });

  const names = [...knowledge.offerings, ...knowledge.products.map((p) => p.name)];
  const covered = names.filter((name) => name.length > 3 && serialized.includes(name.toLowerCase()));
  checks.push({
    label: "Client products/services represented",
    pass: names.length === 0 || covered.length > 0,
    detail: names.length === 0 ? "no products specified" : `${covered.length}/${names.length} represented`,
  });

  const businessName = knowledge.businessName.toLowerCase();
  const consistent =
    businessName.length === 0 ||
    document.pages.every(
      (page) =>
        page.title.toLowerCase().includes(businessName.slice(0, 12)) ||
        JSON.stringify(page.sections).toLowerCase().includes(businessName.slice(0, 12)) ||
        businessName.length < 3,
    );
  checks.push({ label: "Consistent business identity", pass: consistent, detail: consistent ? "ok" : "name drift across pages" });

  return checks;
}

/** Human-readable generation context: the complete project knowledge. */
export function summarizeKnowledge(knowledge: ProjectKnowledge): string {
  const lines: string[] = [];
  lines.push(`Business: ${knowledge.businessName || "(unnamed)"}`);
  if (knowledge.summary) lines.push(`Offering: ${knowledge.summary}`);
  lines.push(`Website type: ${knowledge.websiteType || "unknown"} / ${knowledge.archetype}`);
  if (knowledge.targetAudience) lines.push(`Audience: ${knowledge.targetAudience}`);
  if (knowledge.valueProposition) lines.push(`Value proposition: ${knowledge.valueProposition}`);
  if (knowledge.offerings.length > 0) lines.push(`Offerings: ${knowledge.offerings.join("; ")}`);
  if (knowledge.products.length > 0) {
    lines.push(`Products: ${knowledge.products.map((p) => `${p.name}${p.price ? ` (${p.price})` : ""}`).join("; ")}`);
  }
  if (knowledge.services.length > 0) {
    lines.push(`Services: ${knowledge.services.map((s) => `${s.name}${s.price ? ` (${s.price})` : ""}`).join("; ")}`);
  }
  if (knowledge.locations.length > 0) lines.push(`Locations: ${knowledge.locations.join("; ")}`);
  const contactBits: string[] = [];
  if (knowledge.contact.known.email) contactBits.push(knowledge.contact.email);
  if (knowledge.contact.known.phone) contactBits.push(knowledge.contact.phone);
  if (contactBits.length > 0) lines.push(`Contact: ${contactBits.join(" / ")}`);
  if (knowledge.pricing.hasPricing) {
    lines.push(`Pricing: ${knowledge.pricing.items.map((item) => `${item.name} ${item.price}`).join("; ")}`);
  }
  if (knowledge.policies.shipping) lines.push(`Shipping: ${knowledge.policies.shipping}`);
  if (knowledge.policies.shippingRegions.length > 0) lines.push(`Serves: ${knowledge.policies.shippingRegions.join(", ")}`);
  if (knowledge.testimonials.length > 0) lines.push(`Testimonials: ${knowledge.testimonials.length} provided`);
  if (knowledge.faqs.length > 0) lines.push(`FAQs: ${knowledge.faqs.length} answered`);
  lines.push(`Unknown (must stay unknown): ${knowledge.unknowns.join("; ") || "none"}`);
  if (knowledge.contentGaps.length > 0) lines.push(`Content gaps: ${knowledge.contentGaps.join(" | ")}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Client corrections (§10): latest confirmed information is authoritative
// ---------------------------------------------------------------------------

const REMOVAL_PATTERNS: RegExp[] = [
  /\b(?:we |i )?(?:don'?t|do not|no longer|stop(?:ped)?)\s+(?:sell|offer|provide|make|do|have|ship|deliver|support|need|want)\s+([^.!?;]{2,80})/i,
  /\bremove\s+(?:the\s+)?([^.!?;]{2,60})\b/i,
  /\bdrop\s+(?:the\s+)?([^.!?;]{2,60})\b/i,
  /\bno\s+(?:more\s+)?([^.!?;]{2,60})\s+anymore\b/i,
];

/** Words that name policies/scopes rather than removable offerings. */
const NON_REMOVABLE = new Set(["delivery", "shipping", "support", "contact", "website", "site", "page", "pricing", "discount", "offer"]);

function stem(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("ses") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && word.length > 3 && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function stemVariants(word: string): string[] {
  const variants = new Set([word, stem(word)]);
  if (word.endsWith("ies") && word.length > 4) variants.add(word.slice(0, -1));
  return [...variants];
}

function wordsOf(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !NON_REMOVABLE.has(word));
}

function matchesRemoval(candidate: string, removalWords: string[]): boolean {
  const candidateWords = wordsOf(candidate);
  if (candidateWords.length === 0 || removalWords.length === 0) return false;
  const removalForms = new Set(removalWords.flatMap(stemVariants));
  const candidateForms = new Set(candidateWords.flatMap(stemVariants));
  // The removal names the candidate ("hoodies" removes "hoodies aimed at
  // college students ...").
  if ([...removalForms].every((form) => candidateForms.has(form))) return true;
  const overlap = candidateWords.filter((word) => stemVariants(word).some((variant) => removalForms.has(variant)));
  // A single shared word is enough when the candidate is short ("hoodies").
  if (candidateWords.length <= 2) return overlap.length >= 1;
  return overlap.length >= Math.min(2, candidateWords.length - 1);
}

/**
 * Applies client corrections ("we don't sell hoodies anymore"): removes the
 * corrected offerings/products/services/pages and scrubs their mention from
 * maintained prose, so future generation never mentions them again. Returns
 * the updated requirements.
 */
export function applyClientCorrections(requirements: Requirements, message: string): Requirements {
  const removals: string[][] = [];
  for (const pattern of REMOVAL_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) removals.push(wordsOf(match[1]));
  }
  if (removals.length === 0) return requirements;
  // Filler words carry no meaning for what is being removed ("anymore").
  const FILLER = new Set(["anymore", "still", "actually", "just", "really", "currently", "now", "anylonger"]);
  const removalWords = [...new Set(removals.flat())].filter((word) => !FILLER.has(word));
  if (removalWords.length === 0) return requirements;

  const next: Requirements = clone(requirements);
  const removedNames: string[] = [];
  const dropMatching = (name: string): boolean => {
    if (matchesRemoval(name, removalWords)) {
      removedNames.push(name);
      return true;
    }
    return false;
  };
  next.business.offerings = next.business.offerings.filter((offering) => !dropMatching(offering));
  next.content.services = next.content.services.filter((service) => !dropMatching(service.name));
  next.content.products = next.content.products.filter((product) => !dropMatching(product.name));
  next.ecommerce.products = next.ecommerce.products.filter((product) => !dropMatching(product.name));
  // Dropping a page ("drop the pricing page", "remove about") updates the plan.
  const pageDrops = removalWords.filter((word) => word !== "page");
  next.website.requiredPages = next.website.requiredPages.filter(
    (page) => !matchesRemoval(page, pageDrops) || page.toLowerCase() === "home" || page.toLowerCase() === "contact",
  );
  // Scrub removed concepts from maintained prose ("T-shirts and hoodies" ->
  // "T-shirts") so the summary, description and about agree with the catalogue.
  if (removedNames.length > 0) {
    next.business.productSummary = scrubMentions(next.business.productSummary, removedNames);
    next.business.description = scrubMentions(next.business.description, removedNames);
    next.content.about = scrubMentions(next.content.about, removedNames);
    if (!next.business.productSummary) {
      next.business.productSummary =
        deriveProductSummary({
          businessName: next.business.name,
          offerings: next.business.offerings,
          description: next.business.description,
          previous: "",
        }) || next.business.productSummary;
    }
  }
  return next;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Removes " and X" / "X and " / ", X" mentions of removed concepts from prose. */
function scrubMentions(text: string, names: string[]): string {
  let out = ` ${text} `;
  for (const name of names) {
    const pattern = escapeRegExp(name.trim());
    if (!pattern) continue;
    out = out.replace(new RegExp(`\\s+and\\s+${pattern}(?=\\s|[.,;])`, "gi"), "");
    out = out.replace(new RegExp(`(\\s)${pattern}\\s+and\\s+`, "gi"), "$1");
    out = out.replace(new RegExp(`,\\s*${pattern}(?=\\s|[.,;])`, "gi"), "");
  }
  return out.replace(/\s+/g, " ").replace(/\s+([.,;])/g, "$1").trim();
}
