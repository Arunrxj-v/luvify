import { describe, expect, it } from "vitest";
import {
  RequirementsSchema,
  applyClientCorrections,
  buildProjectKnowledge,
  buildSiteDocument,
  checkContentQuality,
  createSiteFromTemplate,
  emptyRequirements,
  extractRequirementsFromText,
  filterSections,
  getTemplate,
  groundedBodyCopy,
  mergeRequirements,
  planPageContent,
  summarizeKnowledge,
  validateDocument,
  type Requirements,
} from "../src";

function clothingStore(): Requirements {
  const base = emptyRequirements("ecommerce");
  return RequirementsSchema.parse({
    ...base,
    business: {
      ...base.business,
      name: "North Loop Tees",
      description: "We sell oversized T-shirts and hoodies aimed at college students who prefer minimal streetwear.",
      productSummary: "A clothing store specializing in oversized T-shirts and hoodies.",
      offerings: ["oversized T-shirts", "hoodies"],
      targetAudience: "college students who prefer minimal streetwear",
    },
    website: { ...base.website, type: "ecommerce" },
    branding: { ...base.branding, brandName: "North Loop Tees" },
  });
}

function serialized(document: ReturnType<typeof createSiteFromTemplate>): string {
  return JSON.stringify(document).toLowerCase();
}

describe("zero-assumption content policy", () => {
  it("keeps unknown information unknown for a limited brief", () => {
    const requirements = clothingStore();
    const knowledge = buildProjectKnowledge(requirements);
    expect(knowledge.unknowns).toContain("phone number");
    expect(knowledge.unknowns).toContain("testimonials/reviews");
    expect(knowledge.unknowns).toContain("pricing");

    const document = createSiteFromTemplate(
      "ecommerce",
      { siteName: "North Loop Tees", requirements },
      { siteType: "ecommerce" },
    );
    const text = serialized(document);

    // No invented company history, counts, reviews, prices or policies.
    expect(text).not.toContain("founded");
    expect(text).not.toMatch(/trusted by|10,000|10k\+|12k\+/);
    expect(text).not.toContain("4.9/5");
    expect(text).not.toContain("free shipping");
    expect(text).not.toContain("30 days");
    expect(text).not.toContain("4.8");
    expect(text).not.toContain("@example.com");
    expect(text).not.toContain("inspector panel");
    // No invented testimonials or team.
    expect(document.pages.flatMap((page) => page.sections.map((s) => s.type))).not.toContain("Testimonials");
    expect(document.pages.flatMap((page) => page.sections.map((s) => s.type))).not.toContain("Team");
    // No invented statistics.
    for (const page of document.pages) {
      for (const section of page.sections) {
        const stats = (section as unknown as { stats?: unknown[] }).stats;
        expect(stats ?? []).toHaveLength(0);
      }
    }
  });

  it("stays specific without inventing facts", () => {
    const requirements = clothingStore();
    const knowledge = buildProjectKnowledge(requirements);
    const body = groundedBodyCopy(knowledge).join(" ").toLowerCase();
    expect(body).toContain("oversized t-shirts");
    expect(body).toContain("hoodies");
    expect(body).toContain("college students");

    const document = createSiteFromTemplate(
      "ecommerce",
      { siteName: "North Loop Tees", requirements },
      { siteType: "ecommerce" },
    );
    const text = serialized(document);
    // Actual client concepts are represented; generic substitutes are not.
    expect(text).toContain("hoodies");
    expect(text).toContain("oversized t-shirts");
    expect(text).not.toContain("sneakers");
    expect(text).not.toContain("plumbing");
  });

  it("keeps verified testimonials and drops invented ones", () => {
    const base = clothingStore();
    const withReviews = RequirementsSchema.parse({
      ...base,
      content: {
        ...base.content,
        testimonials: [{ quote: "Fits perfectly, great fabric.", author: "Ananya", role: "Student" }],
      },
    });
    const knowledge = buildProjectKnowledge(withReviews);
    expect(knowledge.testimonials).toHaveLength(1);

    const kept = createSiteFromTemplate("agency", { siteName: "North Loop Tees", requirements: withReviews }, {});
    expect(serialized(kept)).toContain("fits perfectly, great fabric");

    const dropped = createSiteFromTemplate("agency", { siteName: "North Loop Tees", requirements: base }, {});
    expect(serialized(dropped)).not.toContain("ahead of schedule");
  });

  it("replaces pricing sections without real prices and honours real ones", () => {
    const base = clothingStore();
    const knowledge = buildProjectKnowledge(base);
    expect(knowledge.pricing.hasPricing).toBe(false);

    const document = createSiteFromTemplate("saas", { siteName: "North Loop Tees", requirements: base }, {});
    const types = document.pages.flatMap((page) => page.sections.map((s) => s.type));
    expect(types).not.toContain("Pricing");
    expect(serialized(document)).not.toContain("149");
    // The journey survives as an honest CTA instead of invented plans.
    expect(serialized(document)).toContain("contact us for pricing");

    const priced = RequirementsSchema.parse({
      ...base,
      content: {
        ...base.content,
        services: [{ name: "Custom print", description: "", price: "₹499" }],
      },
    });
    expect(buildProjectKnowledge(priced).pricing.hasPricing).toBe(true);
    const pricedDoc = createSiteFromTemplate("personal", { siteName: "North Loop Tees", requirements: priced }, {});
    expect(serialized(pricedDoc)).toContain("₹499");
  });

  it("only renders team sections when requested", () => {
    const base = clothingStore();
    const unrequested = createSiteFromTemplate("agency", { siteName: "North Loop Tees", requirements: base }, {});
    expect(unrequested.pages.flatMap((p) => p.sections.map((s) => s.type))).not.toContain("Team");

    const requested = RequirementsSchema.parse({
      ...base,
      website: { ...base.website, requiredPages: ["Home", "Team", "Contact"] },
    });
    const knowledge = buildProjectKnowledge(requested, { requiredPages: ["Home", "Team", "Contact"] });
    expect(filterSections(["Navbar", "Team", "Footer"], knowledge)).toContain("Team");
  });

  it("only renders FAQs answerable from known requirements", () => {
    const base = clothingStore();
    const document = createSiteFromTemplate("portfolio", { siteName: "North Loop Tees", requirements: base }, {});
    expect(document.pages.flatMap((p) => p.sections.map((s) => s.type))).not.toContain("FAQ");

    const answered = RequirementsSchema.parse({
      ...base,
      content: {
        ...base.content,
        faq: [{ question: "Do you ship hoodies?", answer: "Yes, across India." }],
      },
    });
    const kept = validateDocument(
      createSiteFromTemplate("portfolio", { siteName: "North Loop Tees", requirements: answered }, {}),
      buildProjectKnowledge(answered),
    );
    expect(serialized(kept.document)).toContain("across india");
  });
});

describe("project knowledge", () => {
  it("builds a traceable source of truth with explicit unknowns", () => {
    const knowledge = buildProjectKnowledge(clothingStore());
    expect(knowledge.summary).toContain("oversized T-shirts");
    expect(knowledge.offerings).toEqual(["oversized T-shirts", "hoodies"]);
    expect(knowledge.targetAudience).toContain("college students");
    expect(knowledge.contact.known.email).toBe(false);
    expect(knowledge.statistics).toEqual([]);
    expect(knowledge.awards).toEqual([]);
    expect(knowledge.certifications).toEqual([]);
    const summary = summarizeKnowledge(knowledge);
    expect(summary).toContain("North Loop Tees");
    expect(summary).toContain("must stay unknown");
  });

  it("plans page content from known facts without inventing", () => {
    const knowledge = buildProjectKnowledge(clothingStore());
    const plan = planPageContent({ name: "About", path: "/about", purpose: "Explain the brand" }, knowledge);
    expect(plan.knownFacts.join(" ")).toContain("hoodies");
    expect(plan.unknowns).toContain("phone number");
    expect(plan.doNotList.join(" ")).toMatch(/founding year|ratings/);
    expect(plan.doList.length).toBeGreaterThan(0);
  });

  it("extracts locations, prices and policies from chat", () => {
    const base = clothingStore();
    const patch = extractRequirementsFromText("We're based in Kochi. Our hoodies start at ₹1,499.", base);
    const merged = RequirementsSchema.parse(mergeRequirements(base, patch));
    expect(merged.business.location).toBe("Kochi");

    const withProduct = RequirementsSchema.parse({
      ...merged,
      content: {
        ...merged.content,
        products: [{ name: "Oversized hoodie", description: "", price: "", category: "" }],
      },
    });
    const priced = RequirementsSchema.parse(
      mergeRequirements(withProduct, extractRequirementsFromText("Our hoodies start at ₹1,499.", withProduct)),
    );
    expect(priced.content.products[0]?.price).toContain("1,499");

    const shipped = RequirementsSchema.parse(
      mergeRequirements(base, extractRequirementsFromText("We don't offer delivery outside India.", base)),
    );
    expect(shipped.ecommerce.shipping.notes).toMatch(/outside india/i);
    expect(shipped.ecommerce.shipping.regions).toContain("India");
    // A scoped delivery area must not disable delivery altogether.
    expect(shipped.features.delivery).toBe(true);
  });

  it("lets client corrections override old information", () => {
    const base = clothingStore();
    const corrected = applyClientCorrections(base, "Actually, we don't sell hoodies anymore.");
    expect(corrected.business.offerings).not.toContain("hoodies");
    expect(corrected.business.offerings).toContain("oversized T-shirts");
    expect(corrected.business.productSummary.toLowerCase()).not.toContain("hoodie");

    const document = createSiteFromTemplate(
      "ecommerce",
      { siteName: "North Loop Tees", requirements: corrected },
      { siteType: "ecommerce" },
    );
    expect(serialized(document)).not.toContain("hoodies");
    expect(serialized(document)).toContain("oversized t-shirts");
  });
});

describe("limited-brief scenarios (§14)", () => {
  const scenarios: Array<{
    name: string;
    template: "ecommerce" | "restaurant" | "saas" | "portfolio" | "agency" | "personal";
    siteType: string;
    business: { name: string; description: string; offerings: string[]; audience: string };
    mustContain: string[];
    mustNotContain: string[];
  }> = [
    {
      name: "clothing store",
      template: "ecommerce",
      siteType: "ecommerce",
      business: {
        name: "North Loop Tees",
        description: "We sell oversized T-shirts and hoodies aimed at college students who prefer minimal streetwear.",
        offerings: ["oversized T-shirts", "hoodies"],
        audience: "college students",
      },
      mustContain: ["oversized t-shirts", "hoodies"],
      mustNotContain: ["sneakers", "jeans", "jackets"],
    },
    {
      name: "hospital appointment system",
      template: "restaurant",
      siteType: "business",
      business: {
        name: "Northside Health",
        description: "A hospital appointment booking platform connecting patients with doctors.",
        offerings: ["appointment booking", "specialist consultations"],
        audience: "patients",
      },
      mustContain: ["appointment booking"],
      mustNotContain: ["online pharmacy", "insurance", "plumbing"],
    },
    {
      name: "restaurant",
      template: "restaurant",
      siteType: "restaurant",
      business: {
        name: "Harbour Bakery",
        description: "A neighbourhood bakery selling sourdough bread and celebration cakes every day.",
        offerings: ["sourdough bread", "celebration cakes"],
        audience: "local families",
      },
      mustContain: ["sourdough", "celebration cakes"],
      mustNotContain: ["fish curry", "sushi"],
    },
    {
      name: "saas product",
      template: "saas",
      siteType: "saas",
      business: {
        name: "Attendly",
        description: "A SaaS platform that helps small businesses manage employee attendance and payroll.",
        offerings: ["attendance tracking", "payroll automation"],
        audience: "small businesses",
      },
      mustContain: ["attendance", "payroll"],
      mustNotContain: ["12k+", "99.98%"],
    },
    {
      name: "portfolio",
      template: "portfolio",
      siteType: "portfolio",
      business: {
        name: "Maya Rao",
        description: "A documentary photographer available for editorial commissions.",
        offerings: ["editorial commissions", "portrait sessions"],
        audience: "magazines and brands",
      },
      mustContain: ["editorial commissions"],
      mustNotContain: ["eleven years", "180+"],
    },
    {
      name: "local service business",
      template: "agency",
      siteType: "business",
      business: {
        name: "FixRight",
        description: "AC repair, refrigerator repair and washing machine repair across the city.",
        offerings: ["AC repair", "refrigerator repair", "washing machine repair"],
        audience: "homeowners",
      },
      mustContain: ["ac repair", "refrigerator repair", "washing machine repair"],
      mustNotContain: ["plumbing", "electrical", "home cleaning"],
    },
  ];

  for (const scenario of scenarios) {
    it(`renders an honest ${scenario.name} from a limited brief`, () => {
      const e = emptyRequirements(scenario.siteType);
      const requirements = RequirementsSchema.parse({
        ...e,
        business: {
          ...e.business,
          name: scenario.business.name,
          description: scenario.business.description,
          productSummary: `${scenario.business.name} offering ${scenario.business.offerings.join(" and ")}.`,
          offerings: scenario.business.offerings,
          targetAudience: scenario.business.audience,
        },
        branding: { ...e.branding, brandName: scenario.business.name },
      });
      const knowledge = buildProjectKnowledge(requirements);
      const document = createSiteFromTemplate(
        scenario.template,
        { siteName: scenario.business.name, requirements },
        { siteType: scenario.siteType },
      );
      const text = serialized(document);
      for (const expected of scenario.mustContain) expect(text, `${scenario.name} missing "${expected}"`).toContain(expected);
      for (const banned of scenario.mustNotContain) expect(text, `${scenario.name} invented "${banned}"`).not.toContain(banned);
      // Universal prohibitions on a limited brief.
      expect(text).not.toContain("founded in");
      expect(text).not.toMatch(/since \d{4}/);
      expect(text).not.toContain("@example.com");
      expect(text).not.toContain("inspector panel");
      expect(text).not.toContain("client name");
      const types = document.pages.flatMap((page) => page.sections.map((s) => s.type));
      expect(types, `${scenario.name} invented reviews`).not.toContain("Testimonials");
      expect(types, `${scenario.name} invented team`).not.toContain("Team");
      const failed = checkContentQuality(document, knowledge).filter((check) => !check.pass);
      expect(failed, `${scenario.name} quality failures: ${JSON.stringify(failed)}`).toEqual([]);
    });
  }
});

describe("content validation", () => {
  it("passes the final quality check on a validated document", () => {
    const requirements = clothingStore();
    const knowledge = buildProjectKnowledge(requirements);
    const document = createSiteFromTemplate("ecommerce", { siteName: "North Loop Tees", requirements }, {});
    const checks = checkContentQuality(document, knowledge);
    const failed = checks.filter((check) => !check.pass);
    expect(failed).toEqual([]);
  });

  it("reports what it removed", () => {
    const requirements = clothingStore();
    const knowledge = buildProjectKnowledge(requirements);
    // Validate the raw template draft (not the already-validated document).
    const template = getTemplate("agency");
    if (!template) throw new Error("agency template missing");
    const raw = buildSiteDocument(
      template.create({ siteName: "North Loop Tees", requirements }),
      { siteType: "agency" },
    );
    expect(raw.pages.flatMap((p) => p.sections.map((s) => s.type))).toContain("Testimonials");
    const { report } = validateDocument(raw, knowledge);
    expect(report.removedSections.join(" ")).toMatch(/Testimonials|Team/);
    // A draft full of invented claims scores below a clean one.
    expect(report.qualityScore).toBeLessThan(100);
  });
});
