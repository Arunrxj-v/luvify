import { describe, expect, it } from "vitest";
import {
  SITE_TEMPLATES,
  SECTION_TYPES,
  RequirementsSchema,
  addSection,
  applyAnswer,
  classifyArchetype,
  computeCompleteness,
  createPlaceholderSection,
  createSiteFromTemplate,
  deriveProductSummary,
  detectChangeRequest,
  detectOfferings,
  emptyRequirements,
  extractRequirementsFromText,
  findColor,
  getPage,
  mergeRequirements,
  parseSiteDocument,
  planArchitecture,
  removeSection,
  setTheme,
  stripIrrelevantPages,
  summarizeSiteDocument,
  updateSection,
} from "../src";

const RESTAURANT_ANSWERS: Array<{ questionId: string; mapsTo: string; text: string; optionLabels?: string[] }> = [
  { questionId: "business-name", mapsTo: "business.name", text: "Kerala Coffee Co." },
  {
    questionId: "business-description",
    mapsTo: "business.description",
    text: "A speciality coffee roastery and all-day cafe serving South Indian breakfast in Kochi.",
  },
  { questionId: "business-industry", mapsTo: "business.industry", text: "Coffee roastery and cafe" },
  { questionId: "target-audience", mapsTo: "business.targetAudience", text: "Coffee lovers and remote workers" },
  { questionId: "location", mapsTo: "business.location", text: "Fort Kochi, Kerala" },
  { questionId: "primary-goal", mapsTo: "website.primaryGoal", text: "Drive table bookings and bean sales" },
  { questionId: "conversion-action", mapsTo: "website.conversionAction", text: "Book a table" },
  { questionId: "required-pages", mapsTo: "website.requiredPages", text: "Home, Menu, About, Contact" },
  { questionId: "brand-name", mapsTo: "branding.brandName", text: "Kerala Coffee Co." },
  { questionId: "primary-color", mapsTo: "branding.primaryColor", text: "deep green" },
  { questionId: "style", mapsTo: "branding.style", text: "warm and premium" },
  { questionId: "fonts", mapsTo: "branding.fontPreference", text: "Fraunces + Work Sans" },
  { questionId: "logo", mapsTo: "branding.logo", text: "We have a logo file ready" },
  { questionId: "headline", mapsTo: "content.headline", text: "Roasted in Kochi, poured with intent" },
  { questionId: "about", mapsTo: "content.about", text: "We roast single-origin beans in small batches every morning." },
  { questionId: "services", mapsTo: "content.services", text: "Filter coffee, Cold brew, Masala dosa" },
  { questionId: "testimonials", mapsTo: "content.testimonials", text: "Best filter coffee in Fort Kochi, Hidden gem for remote work" },
  { questionId: "faq", mapsTo: "content.faq", text: "Do you have wifi?, Are you dog friendly?" },
  { questionId: "email", mapsTo: "content.contact.email", text: "hello@keralacoffee.co" },
  { questionId: "feature", mapsTo: "features", text: "yes", optionLabels: ["Booking", "Newsletter", "Reviews"] },
  { questionId: "domain", mapsTo: "technical.domain", text: "keralacoffee.co" },
  { questionId: "analytics", mapsTo: "technical.analytics.provider", text: "Plausible" },
  { questionId: "seo-description", mapsTo: "technical.seo.defaultDescription", text: "Speciality coffee roastery and cafe in Fort Kochi." },
  { questionId: "seo-keywords", mapsTo: "technical.seo.keywords", text: "coffee kochi, roastery, cafe, filter coffee" },
];

describe("requirements", () => {
  it("starts empty and becomes ready once the interview answers are applied", () => {
    let requirements = emptyRequirements("restaurant");
    const empty = computeCompleteness(requirements);
    expect(empty.overall).toBeLessThan(20);
    expect(empty.readyForGeneration).toBe(false);

    for (const answer of RESTAURANT_ANSWERS) {
      requirements = mergeRequirements(requirements, applyAnswer(requirements, answer));
    }

    expect(requirements.business.name).toBe("Kerala Coffee Co.");
    expect(requirements.website.requiredPages).toEqual(["Home", "Menu", "About", "Contact"]);
    expect(requirements.branding.primaryColor).toBe("#16a34a");
    expect(requirements.features.booking).toBe(true);
    expect(requirements.features.reviewed).toBe(true);
    expect(requirements.content.services.length).toBeGreaterThan(0);

    const report = computeCompleteness(requirements);
    expect(report.overall).toBeGreaterThanOrEqual(70);
    expect(report.readyForGeneration).toBe(true);
    expect(report.blocking).toEqual([]);
  });

  it("detects colors from natural language", () => {
    expect(findColor("use a deep burgundy please")).toBe("#6b1f33");
    expect(findColor("brand colour is #0a0a0a")).toBe("#0a0a0a");
  });

  it("marks e-commerce as not applicable for a portfolio", () => {
    const report = computeCompleteness(emptyRequirements("portfolio"));
    expect(report.categories.find((category) => category.key === "ecommerce")?.applicable).toBe(false);
  });
});

describe("site documents", () => {
  it("builds a valid document from every template", () => {
    for (const template of SITE_TEMPLATES) {
      const document = createSiteFromTemplate(template.id, { siteName: "Acme Studio" }, { provider: "test" });
      expect(document.siteName).toBe("Acme Studio");
      expect(document.pages.length).toBeGreaterThan(1);
      expect(document.navigation.length).toBe(document.pages.length);
      expect(document.footer.type).toBe("Footer");
      const home = getPage(document, "/");
      expect(home?.sections.length).toBeGreaterThan(3);
      expect(home?.sections[0]?.type).toBe("Navbar");
      expect(home?.sections.some((section) => section.type === "Hero")).toBe(true);
      expect(summarizeSiteDocument(document)).toContain(document.siteName);
      expect(() => parseSiteDocument(structuredClone(document))).not.toThrow();
    }
  });

  it("creates a valid placeholder for every supported section type", () => {
    for (const type of SECTION_TYPES) {
      const section = createPlaceholderSection(type, { siteName: "Test Co." });
      expect(section.type).toBe(type);
      expect(section.id.length).toBeGreaterThan(2);
    }
  });

  it("edits sections, theme and pages immutably", () => {
    const document = createSiteFromTemplate("saas", { siteName: "Acme" }, {});
    const target = document.pages[0]!.sections[1]!;
    const updated = updateSection(document, target.id, { title: "New headline" });
    expect(updated.pages[0]?.sections[1]).toMatchObject({ title: "New headline" });
    expect(document.pages[0]?.sections[1]).not.toMatchObject({ title: "New headline" });

    const themed = setTheme(updated, { colors: { primary: "#000000" }, radius: 24 });
    expect(themed.theme.colors.primary).toBe("#000000");
    expect(themed.theme.radius).toBe(24);

    const withExtra = addSection(themed, "/", createPlaceholderSection("Pricing", { siteName: "Acme" }));
    const pricingSection = withExtra.pages[0]!.sections.at(-1)!;
    expect(pricingSection.type).toBe("Pricing");

    const removed = removeSection(withExtra, pricingSection.id);
    expect(removed.pages[0]!.sections).toHaveLength(withExtra.pages[0]!.sections.length - 1);
  });
});

describe("change requests", () => {
  it("detects a request to change the site and ignores plain facts", () => {
    expect(detectChangeRequest("Change the About page to use a darker design")).toBe(
      "Change the About page to use a darker design",
    );
    expect(detectChangeRequest("  make the headline shorter  ")).toBe("make the headline shorter");
    expect(detectChangeRequest("We're open Tuesday to Sunday")).toBeUndefined();
    expect(detectChangeRequest("Our phone number is +44 1234 567890")).toBeUndefined();
    expect(detectChangeRequest("   ")).toBeUndefined();
  });

  it("caps a long request at 300 characters", () => {
    const long = `change the design ${"darker ".repeat(100)}`;
    expect(detectChangeRequest(long)?.length).toBe(300);
  });

  it("queues change requests on the requirements without duplicates", () => {
    const request = "Change the About page to use a darker design";
    const base = emptyRequirements("business");
    // Same shape the conversation route builds: a loose extraction patch.
    const patch = (extra: string[]): Record<string, unknown> => ({
      website: { changeRequests: extra },
    });

    const queued = mergeRequirements(base, patch([request]));
    expect(queued.website.changeRequests).toEqual([request]);

    const again = mergeRequirements(queued, patch([request]));
    expect(again.website.changeRequests).toEqual([request]);

    const extended = mergeRequirements(again, patch([request, "Swap the logo for a wordmark"]));
    expect(extended.website.changeRequests).toEqual([request, "Swap the logo for a wordmark"]);
  });
});

describe("product summary and offerings", () => {
  it("extracts what the client sells from their own words", () => {
    expect(detectOfferings("I need a website for my bakery. We make custom wedding cakes and birthday cakes.")).toEqual([
      "custom wedding cakes",
      "birthday cakes",
    ]);
    expect(detectOfferings("We also provide dessert catering.")).toEqual(["dessert catering"]);
    // Facts that state no offering must not produce one.
    expect(detectOfferings("Our phone number is +44 1234 567890")).toEqual([]);
  });

  it("summarises the business from its description and offerings", () => {
    const summary = deriveProductSummary({
      businessName: "Harbour Bakery",
      description: "A bakery that specialises in celebration cakes for local families.",
      offerings: ["custom wedding cakes", "birthday cakes", "dessert catering"],
    });
    expect(summary).toBe("A bakery specializing in custom wedding cakes, birthday cakes and dessert catering.");
  });

  it("grows an existing summary when the client adds an offering", () => {
    const first = deriveProductSummary({
      businessName: "Harbour Bakery",
      description: "A bakery that specialises in celebration cakes.",
      offerings: ["custom wedding cakes", "birthday cakes"],
    });
    expect(first).toBe("A bakery specializing in custom wedding cakes and birthday cakes.");

    // Saying the same thing again never rewrites or duplicates the summary.
    expect(
      deriveProductSummary({
        businessName: "Harbour Bakery",
        description: "A bakery that specialises in celebration cakes.",
        offerings: ["custom wedding cakes", "birthday cakes"],
        previous: first,
      }),
    ).toBe(first);

    // A genuinely new offering is appended; nothing already stored is lost.
    const grown = deriveProductSummary({
      businessName: "Harbour Bakery",
      description: "A bakery that specialises in celebration cakes.",
      offerings: ["custom wedding cakes", "birthday cakes", "dessert catering"],
      previous: first,
    });
    expect(grown).toContain("custom wedding cakes and birthday cakes");
    expect(grown).toContain("Also offering dessert catering.");
  });

  it("records offerings on the requirements without inventing any", () => {
    const base = emptyRequirements("restaurant");
    const requirements = RequirementsSchema.parse(
      mergeRequirements(base, extractRequirementsFromText("We make custom wedding cakes and birthday cakes.", base)),
    );
    expect(requirements.business.offerings).toEqual(["custom wedding cakes", "birthday cakes"]);
    expect(requirements.business.productSummary).toContain("custom wedding cakes and birthday cakes");
  });
});

describe("website archetypes", () => {
  const classify = (input: Parameters<typeof classifyArchetype>[0]) => classifyArchetype(input);

  it("classifies real projects from their summary and requirements", () => {
    expect(
      classify({
        productSummary: "A bakery specializing in custom wedding cakes, birthday cakes and dessert catering.",
        description: "A bakery that specialises in celebration cakes.",
        websiteType: "business",
      }),
    ).toBe("restaurant");

    expect(
      classify({
        productSummary: "A hospital appointment booking platform connecting patients with doctors.",
        description: "We help patients find a doctor and book appointments online.",
      }),
    ).toBe("healthcare");

    expect(
      classify({
        productSummary: "A SaaS platform that helps small businesses automatically manage employee attendance and payroll.",
        description: "Payroll automation software for small teams.",
        websiteType: "saas",
      }),
    ).toBe("saas");

    expect(
      classify({
        productSummary: "A documentary photographer available for editorial commissions.",
        description: "Photography portfolio and commissions.",
      }),
    ).toBe("portfolio");

    expect(
      classify({
        productSummary: "A home cleaning service covering the greater Manchester area.",
        description: "Domestic cleaning, end of tenancy cleaning and office cleaning.",
        websiteType: "business",
      }),
    ).toBe("business");
  });

  it("stays custom when nothing clear can be determined", () => {
    expect(classify({ websiteType: "other" })).toBe("custom");
    expect(classify({ description: "We are still working out what we need." })).toBe("custom");
  });

  it("never plans shop pages unless the client sells online", () => {
    const { pages } = planArchitecture("business", { requiredPages: ["Home", "Services", "Contact"] });
    expect(pages.map((page) => page.path)).toEqual(["/", "/services", "/about", "/contact"]);

    const kept = stripIrrelevantPages(
      [
        { name: "Home", path: "/" },
        { name: "Shop", path: "/shop" },
        { name: "Cart", path: "/cart" },
        { name: "Contact", path: "/contact" },
      ],
      "healthcare",
      { requested: ["Home", "Contact"] },
    );
    expect(kept.map((page) => page.path)).toEqual(["/", "/contact"]);
  });

  it("keeps commerce pages when the client actually asked for a shop", () => {
    const kept = stripIrrelevantPages(
      [
        { name: "Home", path: "/" },
        { name: "Shop", path: "/shop" },
        { name: "Cart", path: "/cart" },
      ],
      "ecommerce",
      { commerce: true },
    );
    expect(kept.map((page) => page.path)).toEqual(["/", "/shop", "/cart"]);
  });
});

