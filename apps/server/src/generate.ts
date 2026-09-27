/**
 * Deterministic website generation: requirements -> website specification ->
 * `SiteDocument`. No AI network calls - the mock provider produces stable,
 * validated output from `@luvify/shared` helpers and the template registry, so
 * previews, exports and tests are reproducible.
 */

import {
  ARCHETYPE_ARCHITECTURES,
  PAGE_KEYWORDS,
  RequirementsSchema,
  WebsiteSpecificationSchema,
  archetypeLabel,
  buildProjectKnowledge,
  classifyArchetype,
  computeCompleteness,
  createSiteFromTemplate,
  deriveProductSummary,
  detectStyle,
  filterSections,
  getTemplate,
  isEcommerceProject,
  mergeRequirements,
  planArchitecture,
  planPageContent,
  recommendTemplateForType,
  slugify,
  stripIrrelevantPages,
  stripIrrelevantSections,
  type ProjectKnowledge,
  type Requirements,
  type SectionType,
  type SiteDocument,
  type TemplateId,
  type WebsiteArchetype,
  type WebsiteSpecification,
} from "@luvify/shared";

const DEFAULT_PAGES: Record<string, string[]> = {
  business: ["Home", "About", "Services", "Contact"],
  portfolio: ["Home", "Portfolio", "About", "Contact"],
  ecommerce: ["Home", "Shop", "About", "Contact"],
  saas: ["Home", "Pricing", "About", "Contact"],
  blog: ["Home", "Blog", "About", "Contact"],
  landing: ["Home"],
  restaurant: ["Home", "Menu", "Gallery", "Contact"],
  agency: ["Home", "Services", "Portfolio", "About", "Contact"],
  personal: ["Home", "About", "Blog", "Contact"],
  other: ["Home", "About", "Contact"],
};

const SECTIONS_BY_PAGE: Record<string, SectionType[]> = {
  Home: ["Navbar", "Hero", "Features", "Services", "Testimonials", "CTA", "Footer"],
  About: ["Navbar", "About", "Team", "Contact", "Footer"],
  Services: ["Navbar", "Services", "FAQ", "CTA", "Footer"],
  Menu: ["Navbar", "Products", "Testimonials", "Contact", "Footer"],
  Shop: ["Navbar", "ProductGrid", "Testimonials", "CTA", "Footer"],
  Portfolio: ["Navbar", "Gallery", "Testimonials", "CTA", "Footer"],
  Gallery: ["Navbar", "Gallery", "Testimonials", "Footer"],
  Pricing: ["Navbar", "Pricing", "FAQ", "CTA", "Footer"],
  Blog: ["Navbar", "Blog", "CTA", "Footer"],
  Contact: ["Navbar", "Contact", "FAQ", "Footer"],
  Team: ["Navbar", "Team", "About", "Footer"],
  FAQ: ["Navbar", "FAQ", "CTA", "Footer"],
  Booking: ["Navbar", "Services", "Contact", "Footer"],
  Shipping: ["Navbar", "Features", "FAQ", "Footer"],
  Terms: ["Navbar", "About", "Footer"],
};

function sectionsForPage(name: string, knowledge?: ProjectKnowledge, commerce?: boolean): SectionType[] {
  const sections = SECTIONS_BY_PAGE[name] ?? ["Navbar", "Hero", "Features", "Contact", "Footer"];
  // SECTION GENERATION IS REQUIREMENT-AWARE: a section is only planned when
  // the client provided information to populate it (testimonials only with
  // reviews, pricing only with real prices, team only when requested, FAQ
  // only when answerable). Unknown information never earns a section.
  if (!knowledge) return sections;
  return filterSections(sections, knowledge, { pageName: name, commerce });
}

function pathForPage(name: string): string {
  const known = PAGE_KEYWORDS.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (known) return known.path;
  return `/${slugify(name, "page")}`;
}

export function defaultPageNames(websiteType: string): string[] {
  return DEFAULT_PAGES[websiteType] ?? DEFAULT_PAGES.other ?? ["Home", "Contact"];
}

/**
 * Derives the structural archetype for a project: the stored classification
 * wins (the AI or the client approved it), otherwise it is classified from
 * the product summary plus the full requirements.
 */
export function archetypeFor(requirements: Requirements): string {
  const stored = requirements.website.archetype.trim().toLowerCase();
  if (stored) return stored;
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

/**
 * The approved information architecture for a project: archetype canon
 * filtered through the relevance check, then client-requested pages the canon
 * does not cover. Returns the plan plus the user journeys that justify it.
 */
export function pagePlanFor(requirements: Requirements): {
  archetype: string;
  pages: Array<{ name: string; path: string; purpose: string }>;
  userJourneys: Array<{ goal: string; steps: string[] }>;
} {
  const archetype = archetypeFor(requirements);
  const commerce = isEcommerceProject(requirements);
  const planned = planArchitecture(archetype as WebsiteArchetype, {
    productSummary: requirements.business.productSummary,
    offerings: requirements.business.offerings,
    requiredPages: requirements.website.requiredPages,
    conversionAction: requirements.website.conversionAction,
    targetAudience: requirements.business.targetAudience,
  });
  // Relevance check: drop pages the archetype must not have (Shop/Cart on a
  // hospital site). Client-requested pages and Home always survive inside
  // stripIrrelevantPages; the approved purposes are re-attached here.
  const purposes = new Map(planned.pages.map((page) => [`${page.name.toLowerCase()}|${page.path.toLowerCase()}`, page.purpose]));
  const pages = stripIrrelevantPages(planned.pages, archetype as WebsiteArchetype, {
    requested: requirements.website.requiredPages,
    commerce,
  }).map((page) => ({ ...page, purpose: purposes.get(`${page.name.toLowerCase()}|${page.path.toLowerCase()}`) ?? "" }));
  return { archetype, pages, userJourneys: planned.userJourneys };
}

/**
 * Keeps the derived project data in step with edited requirements:
 *
 * - the Product/Business Summary is re-derived from the client's description
 *   and offerings (a hand-edited summary is never overwritten when
 *   `keepSummary` is set);
 * - the archetype and approved page plan are recomputed so generation always
 *   follows a plan the client actually approved (`keepPlan` preserves an
 *   explicit plan edit).
 */
export function refreshDerivedFields(
  requirements: Requirements,
  options: { keepSummary?: boolean; keepPlan?: boolean } = {},
): Requirements {
  const business = requirements.business;
  let currentReq = requirements;

  if (!options.keepSummary) {
    const derived = deriveProductSummary({
      businessName: business.name,
      offerings: business.offerings,
      description: business.description,
      previous: business.productSummary,
    });
    if (derived && derived !== business.productSummary) {
      currentReq = RequirementsSchema.parse(
        mergeRequirements(currentReq, { business: { productSummary: derived } } as Partial<Requirements>),
      );
    }
  }

  if (!options.keepPlan) {
    const plan = pagePlanFor(currentReq);
    currentReq = RequirementsSchema.parse(
      mergeRequirements(currentReq, {
        website: { archetype: plan.archetype, pagePlan: plan.pages, userJourneys: plan.userJourneys },
      } as Partial<Requirements>),
    );
  }

  return currentReq;
}

export interface SpecificationInput {
  siteName: string;
  websiteType: string;
  requirements: Requirements;
  provider: string;
  version: number;
  requestedPages?: string[];
}

/**
 * Builds the structured `WebsiteSpecification` contract from requirements.
 * Pages come from `website.requiredPages` when present, otherwise the defaults
 * for the website type; every page gets a concrete section list so the spec
 * panel and the site builder always agree.
 */
export function buildSpecification(input: SpecificationInput): WebsiteSpecification {
  const req = input.requirements;
  const commerce = isEcommerceProject(req);
  const plan = pagePlanFor(req);
  // The project knowledge is the structured source of truth: every factual
  // item traceable to the client, everything else explicitly unknown.
  const knowledge = buildProjectKnowledge(req, {
    archetype: plan.archetype,
    requiredPages: plan.pages.map((page) => page.name),
    userJourneys: plan.userJourneys,
  });

  // The approved architecture drives the pages; legacy fallbacks only apply
  // when the plan is empty (which cannot happen - every plan has a Home).
  const requested = (input.requestedPages ?? req.website.requiredPages).map((name) => name.trim()).filter(Boolean);
  const planByPath = new Map(plan.pages.map((page) => [page.path.toLowerCase(), page]));
  const planByName = new Map(plan.pages.map((page) => [page.name.toLowerCase(), page]));
  const pageNames = [...(requested.length > 0 ? requested : plan.pages.map((page) => page.name))];
  // Every site needs a landing page: without a "/" page there would be no
  // index.html to serve at the site root and no home link to navigate to.
  if (!pageNames.some((name) => pathForPage(name) === "/")) pageNames.unshift("Home");

  const seen = new Set<string>();
  const productSummary = req.business.productSummary.trim();
  const pages = pageNames
    // The approved plan owns the path; PAGE_KEYWORDS is only a fallback for
    // pages the plan does not know about.
    .map((name) => ({ name, path: planByName.get(name.toLowerCase())?.path ?? pathForPage(name) }))
    .filter((page) => {
      if (seen.has(page.path)) return false;
      seen.add(page.path);
      return true;
    })
    .map((page) => {
      const approved = planByPath.get(page.path.toLowerCase()) ?? planByName.get(page.name.toLowerCase());
      const grounded = productSummary || req.business.description;
      // PAGE-SPECIFIC CONTENT PLANNING: each page gets its purpose plus the
      // known facts it may use and the unknowns it must not invent.
      const contentPlan = planPageContent(
        { name: approved?.name ?? page.name, path: page.path, purpose: approved?.purpose },
        knowledge,
      );
      return {
        id: slugify(page.name, "page"),
        name: page.name,
        path: page.path,
        // Titles and descriptions name the actual business, never "page".
        title: grounded ? `${page.name} - ${grounded.slice(0, 80)}` : `${page.name} - ${input.siteName}`,
        description: approved?.purpose || (grounded ? `${page.name} page for ${grounded.slice(0, 120)}` : `${page.name} page for ${input.siteName}`),
        purpose:
          approved?.purpose ||
          (page.path === "/"
            ? `Introduce ${grounded || "the business"} and drive ${req.website.conversionAction || "the primary conversion action"}`
            : `Support the visitor looking for ${page.name.toLowerCase()} at ${grounded || input.siteName}`),
        sections: stripIrrelevantSections(
          sectionsForPage(approved?.name ?? page.name, knowledge, commerce),
          commerce,
        ) as SectionType[],
        contentPlan: {
          knownFacts: contentPlan.knownFacts,
          unknowns: contentPlan.unknowns.slice(0, 10),
          doList: contentPlan.doList,
          doNotList: contentPlan.doNotList,
        },
      };
    });

  if (pages.length === 0) {
    const homePlan = planPageContent(
      { name: "Home", path: "/", purpose: "Introduce the business and drive the primary conversion action" },
      knowledge,
    );
    pages.push({
      id: "home",
      name: "Home",
      path: "/",
      title: `Home - ${input.siteName}`,
      description: input.siteName,
      purpose: "Introduce the business and drive the primary conversion action",
      sections: sectionsForPage("Home", knowledge, commerce),
      contentPlan: {
        knownFacts: homePlan.knownFacts,
        unknowns: homePlan.unknowns.slice(0, 10),
        doList: homePlan.doList,
        doNotList: homePlan.doNotList,
      },
    });
  }

  const style = req.branding.style ? detectStyle(req.branding.style, "modern") : "modern";
  const [headingFont, bodyFont] = (req.branding.fontPreference || "Inter + Inter")
    .split("+")
    .map((font) => font.trim())
    .filter(Boolean);

  const sectionsByPage: Record<string, SectionType[]> = {};
  for (const page of pages) sectionsByPage[page.path] = page.sections;

  return WebsiteSpecificationSchema.parse({
    siteName: input.siteName,
    siteType: input.websiteType,
    tagline: req.content.subheadline || req.website.purpose || productSummary || req.business.description,
    summary: [
      // The product/business summary is the primary source of truth.
      productSummary,
      req.business.description,
      // Change requests captured in chat stay attached to the project and are
      // surfaced here so the next build/modify pass works from them.
      req.website.changeRequests.length > 0 ? `Change requests: ${req.website.changeRequests.join(" | ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    projectContext: {
      siteName: input.siteName,
      businessName: req.business.name,
      productSummary,
      offerings: req.business.offerings,
      valueProposition: req.business.valueProposition,
      industry: req.business.industry,
      targetAudience: req.business.targetAudience,
      primaryGoal: req.website.primaryGoal,
      conversionAction: req.website.conversionAction,
      toneOfVoice: req.website.toneOfVoice,
      archetype: plan.archetype,
      contact: {
        email: req.content.contact.email,
        phone: req.content.contact.phone,
        address: req.content.contact.address,
        hours: req.content.contact.hours,
      },
    },
    architecture: {
      archetype: plan.archetype,
      pages: plan.pages.map((page) => ({
        id: slugify(page.name, "page"),
        name: page.name,
        path: page.path,
        title: "",
        description: "",
        purpose: page.purpose,
        sections: [],
      })),
      userJourneys: plan.userJourneys,
    },
    // The structured source of truth travels with the specification, so every
    // page generation request receives the complete project knowledge.
    knowledge: {
      ...knowledge,
      projectId: "",
    },
    targetAudience: req.business.targetAudience,
    primaryGoal: req.website.primaryGoal,
    conversionAction: req.website.conversionAction,
    pages,
    design: {
      style,
      mood: req.website.toneOfVoice,
      imageryDirection: `Imagery that feels ${req.website.toneOfVoice || "authentic"} and on-brand`,
      colors: {
        primary: req.branding.primaryColor || "#1f6feb",
        secondary: req.branding.secondaryColor || "#0f172a",
        accent: req.branding.accentColor || "#f59e0b",
      },
      typography: { headingFont: headingFont || "Inter", bodyFont: bodyFont || headingFont || "Inter" },
    },
    sections: sectionsByPage,
    features: {
      contactForm: req.features.contactForm,
      booking: req.features.booking,
      newsletter: req.features.newsletter,
      authentication: req.features.authentication,
      payments: req.features.payments,
      blog: req.features.blog,
      ecommerce: req.features.ecommerce || commerce,
      search: req.features.search,
      reviews: req.features.reviews,
      delivery: req.features.delivery,
      multiLanguage: req.features.multiLanguage,
      liveChat: req.features.liveChat,
    },
    contentPlan: {
      headline: req.content.headline,
      subheadline: req.content.subheadline,
      about: req.content.about,
      toneOfVoice: req.website.toneOfVoice,
      serviceCount: req.content.services.length,
      productCount: req.ecommerce.products.length || req.content.products.length,
      testimonialCount: req.content.testimonials.length,
      faqCount: req.content.faq.length,
    },
    seo: {
      titleTemplate: req.technical.seo.titleTemplate || `%s | ${input.siteName}`,
      description: req.technical.seo.defaultDescription || req.business.description,
      keywords: req.technical.seo.keywords.length
        ? req.technical.seo.keywords
        : [req.business.industry, input.websiteType].filter((value) => Boolean(value)),
    },
    commerce: {
      enabled: commerce,
      currency: req.ecommerce.currency || "USD",
      paymentProvider: req.ecommerce.paymentProvider,
      productCount: req.ecommerce.products.length || req.content.products.length,
      shippingNotes: req.ecommerce.shipping.notes,
      catalogNotes: req.ecommerce.catalogSize,
    },
    technical: {
      domain: req.technical.domain,
      hosting: req.technical.hosting || "luvify local hosting",
      analytics: req.technical.analytics.provider,
      accessibility: req.technical.accessibility,
    },
    version: input.version,
    provider: input.provider,
  });
}

export interface DocumentInput {
  project: { name: string; businessName: string; websiteType: string; templateId: string | null };
  requirements: Requirements;
  specification: WebsiteSpecification;
  versionNumber: number;
  provider: string;
  templateId?: string | undefined;
}

/** Picks the template to render with: request -> project -> type recommendation. */
export function resolveTemplateId(input: {
  requested?: string | null | undefined;
  current?: string | null | undefined;
  websiteType: string;
  archetype?: string | null | undefined;
}): TemplateId {
  if (input.requested && getTemplate(input.requested)) return input.requested as TemplateId;
  if (input.current && getTemplate(input.current)) return input.current as TemplateId;
  return templateForArchetype(input.archetype) ?? recommendTemplateForType(input.websiteType);
}

/**
 * An explicitly chosen template, or null when the client did not choose one.
 * Unchosen projects resolve their template from the classified archetype at
 * generation time - when requirements exist to classify - instead of locking
 * a possibly wrong-domain template at creation time.
 */
export function creationTemplateId(requested?: string | null | undefined): TemplateId | null {
  if (requested && getTemplate(requested)) return requested as TemplateId;
  return null;
}

/** Closest template for a classified archetype; null lets the type decide. */
export function templateForArchetype(archetype: string | null | undefined): TemplateId | null {
  switch ((archetype ?? "").toLowerCase()) {
    case "ecommerce":
    case "marketplace":
      return "ecommerce";
    case "saas":
      return "saas";
    case "healthcare":
    case "booking":
      // Neutral structure: a clinic must never render restaurant or agency copy.
      return "services";
    case "restaurant":
    case "event":
      return "restaurant";
    case "portfolio":
      return "portfolio";
    case "agency":
      return "agency";
    case "business":
    case "education":
    case "realestate":
    case "nonprofit":
    case "community":
      return "services";
    case "blog":
    case "personal":
      return "personal";
    default:
      return null;
  }
}

/** Turns a validated specification into a validated `SiteDocument`. */
export function buildDocument(input: DocumentInput): SiteDocument {
  const archetype = input.specification.architecture?.archetype || archetypeFor(input.requirements);
  const templateId = resolveTemplateId({
    requested: input.templateId,
    current: input.project.templateId,
    websiteType: input.project.websiteType,
    archetype,
  });

  // GENERATION CONTEXT: every page generation request receives the complete
  // current project knowledge - verified facts, unknowns, the approved
  // architecture and the current page's purpose - never unrelated projects or
  // generic templates.
  const knowledge =
    input.specification.knowledge && input.specification.knowledge.knownFacts.length > 0
      ? input.specification.knowledge
      : buildProjectKnowledge(input.requirements, {
          archetype,
          requiredPages: input.specification.architecture?.pages.map((page) => page.name),
          userJourneys: input.specification.architecture?.userJourneys,
        });

  const document = createSiteFromTemplate(
    templateId,
    {
      siteName: input.project.businessName || input.project.name || input.specification.siteName,
      tagline: input.specification.tagline,
      contact: {
        email: input.requirements.content.contact.email,
        phone: input.requirements.content.contact.phone,
        address: input.requirements.content.contact.address,
        hours: input.requirements.content.contact.hours,
      },
      requirements: input.requirements,
      knowledge,
      provider: input.provider,
    },
    {
      siteType: input.project.websiteType,
      completeness: computeCompleteness(input.requirements).overall,
      versionNumber: input.versionNumber,
      specificationVersion: input.specification.version,
    },
  );

  // The approved page plan is authoritative: keep only planned pages, and
  // never surface commerce scaffolding without commerce intent.
  return alignDocumentToPlan(document, input.specification, isEcommerceProject(input.requirements));
}

export interface AlignedPageInput {
  pages: Array<{ name: string; path: string }>;
}

/**
 * Constrains a built document to the approved architecture: drops pages the
 * plan does not contain (e.g. Shop/Cart on a hospital site), rebuilds the
 * navigation from the surviving pages, and strips commerce implies sections
 * when the project has no commerce intent. Planned-but-missing pages keep
 * their slot via a grounded placeholder built from sibling content so links
 * never 404.
 */
export function alignDocumentToPlan(
  document: SiteDocument,
  specification: Pick<WebsiteSpecification, "siteName" | "projectContext" | "architecture">,
  commerce: boolean,
): SiteDocument {
  const planned = specification.architecture?.pages ?? [];
  if (planned.length === 0) return document;

  const keyOf = (name: string, path: string) => `${name.toLowerCase()}|${path.toLowerCase()}`;

  const sibling = document.pages[0];
  const summary = specification.projectContext?.productSummary || specification.siteName;

  const pages: SiteDocument["pages"] = [];
  for (const plan of planned) {
    const existing =
      document.pages.find((page) => keyOf(page.name, page.path) === keyOf(plan.name, plan.path)) ??
      document.pages.find((page) => page.path.toLowerCase() === plan.path.toLowerCase());
    if (existing) {
      pages.push({
        ...existing,
        name: plan.name,
        path: plan.path,
        title: existing.title || `${plan.name} - ${summary}`,
        description: existing.description || plan.purpose || `${plan.name} page for ${summary}`,
      });
      continue;
    }
    if (!sibling) continue;
    // A planned page the template did not render: clone the home page's
    // chrome (navbar/footer) with a grounded CTA body built from the page's
    // own purpose - never an error, never another site's content.
    const contactPath = planned.some((entry) => entry.path === "/contact") ? "/contact" : "/";
    const placeholderCta = {
      id: `cta-${plan.path.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "home"}-planned`,
      visible: true,
      type: "CTA",
      eyebrow: "",
      title: plan.purpose || plan.name,
      body: "",
      button: { label: "Contact us", path: contactPath, external: false },
      variant: "solid",
      note: "",
    };
    pages.push({
      ...structuredClone(sibling),
      id: `${plan.path === "/" ? "home" : plan.path.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-")}-planned`,
      name: plan.name,
      path: plan.path,
      title: `${plan.name} - ${summary}`,
      description: plan.purpose || `${plan.name} page for ${summary}`,
      sections: [
        ...sibling.sections.filter((section) => section.type === "Navbar" || section.type === "Footer"),
        placeholderCta,
      ] as SiteDocument["pages"][number]["sections"],
    });
  }
  const navigation = pages.length > 0 ? pages.map((page) => ({ label: page.name, path: page.path, external: false })) : document.navigation;
  const aligned: SiteDocument = {
    ...document,
    pages: pages.length > 0 ? pages : document.pages,
    navigation,
    // The footer sitemap is rebuilt from the surviving pages: template links
    // to dropped pages (Work, Studio, ...) must not ship.
    footer: {
      ...document.footer,
      columns: [
        { title: "Pages", links: navigation },
        ...document.footer.columns.filter((column) => column.title !== "Pages"),
      ],
    },
  };
  // Section-level navigation is rebuilt from the surviving pages for the same
  // reason: a kept page's navbar must not link to pages that no longer exist.
  const withNavigation = {
    ...aligned,
    pages: aligned.pages.map((page) => ({
      ...page,
      sections: page.sections.map((section) => {
        if (section.type !== "Navbar") return section;
        const links = navigation.filter((link) => link.path !== page.path);
        const cta =
          section.cta?.path && navigation.some((link) => link.path === section.cta?.path)
            ? section.cta
            : { label: section.cta?.label || "Contact us", path: navigation[0]?.path ?? "/" };
        return { ...section, links, cta };
      }),
    })),
  };
  if (!commerce) {
    return {
      ...withNavigation,
      pages: withNavigation.pages.map((page) => ({
        ...page,
        sections: page.sections.filter(
          (section) => section.type !== "ProductGrid" && section.type !== "ProductCard" && section.type !== "Pricing",
        ),
      })),
    };
  }
  return withNavigation;
}

function structuredClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface DocumentDiff {
  changeSummary: string[];
  affectedSections: string[];
}

/** Section content without its (random, per-build) id, for stable comparison. */
function stableSection(section: { id: string } & Record<string, unknown>): string {
  const clone: Record<string, unknown> = { ...section };
  delete clone.id;
  return JSON.stringify(clone);
}

/**
 * What changed between two documents - drives the modification summary card.
 * Sections are matched by type + content (ids are regenerated on every build),
 * so an unchanged page reports no false positives.
 */
export function diffDocuments(before: SiteDocument, after: SiteDocument): DocumentDiff {
  const summary: string[] = [];
  const affected = new Set<string>();

  for (const page of after.pages) {
    const previous = before.pages.find((entry) => entry.path === page.path);
    if (!previous) {
      summary.push(`Added page ${page.name}`);
      for (const section of page.sections) affected.add(`${page.name}: ${section.type}`);
      continue;
    }

    const pool = [...previous.sections];
    for (const section of page.sections) {
      const stable = stableSection(section as unknown as { id: string } & Record<string, unknown>);
      const exact = pool.findIndex(
        (candidate) =>
          candidate.type === section.type &&
          stableSection(candidate as unknown as { id: string } & Record<string, unknown>) === stable,
      );
      if (exact !== -1) {
        pool.splice(exact, 1);
        continue;
      }
      const sameType = pool.findIndex((candidate) => candidate.type === section.type);
      if (sameType !== -1) {
        pool.splice(sameType, 1);
        summary.push(`Updated ${section.type} content on ${page.name}`);
        affected.add(`${page.name}: ${section.type}`);
        continue;
      }
      summary.push(`Added ${section.type} to ${page.name}`);
      affected.add(`${page.name}: ${section.type}`);
    }

    for (const leftover of pool) {
      summary.push(`Removed ${leftover.type} from ${page.name}`);
      affected.add(`${page.name}: ${leftover.type}`);
    }
  }

  for (const page of before.pages) {
    if (!after.pages.some((entry) => entry.path === page.path)) summary.push(`Removed page ${page.name}`);
  }

  if (summary.length === 0) summary.push("Refreshed copy, theme tokens and section content");
  return {
    changeSummary: [...new Set(summary)].slice(0, 12),
    affectedSections: [...new Set(affected)].slice(0, 20),
  };
}
