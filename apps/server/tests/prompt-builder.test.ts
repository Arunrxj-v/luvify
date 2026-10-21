/**
 * Stage-1 prompt builder tests.
 *
 * These verify the contract that matters for generation quality: the final
 * model receives a structured, project-specific specification (not raw input),
 * unrelated domains are explicitly excluded, unknown data is never invented,
 * user corrections outrank domain defaults, and one project can never leak
 * into another project's prompt.
 */

import { describe, expect, it } from "vitest";
import { RequirementsSchema, emptyRequirements, type Requirements } from "@luvify/shared";
import {
  GENERATION_PROMPT_VERSION,
  buildGenerationPrompt,
  buildWebsiteSpecification,
  validateGeneratedDocument,
  validateWebsiteSpecification,
} from "../src/services/ai/prompt-builder";
import { buildDocument, buildSpecification } from "../src/generate";

function hospitalRequirements(overrides: Partial<Requirements["website"]> = {}): Requirements {
  const base = emptyRequirements("business");
  return RequirementsSchema.parse({
    ...base,
    business: {
      ...base.business,
      name: "Northside Health",
      description: "A hospital appointment booking platform connecting patients with doctors.",
      productSummary: "A hospital appointment booking platform connecting patients with doctors.",
      offerings: ["appointment booking", "specialist consultations"],
      targetAudience: "patients",
    },
    website: {
      ...base.website,
      type: "business",
      purpose: "Allow patients to find doctors and request appointments.",
      primaryGoal: "Book appointments",
      conversionAction: "Book an appointment",
      requiredPages: ["Home", "Doctors", "Contact"],
      ...overrides,
    },
    content: {
      ...base.content,
      contact: { ...base.content.contact, email: "care@northside.test" },
    },
  });
}

function candleRequirements(): Requirements {
  const base = emptyRequirements("ecommerce");
  return RequirementsSchema.parse({
    ...base,
    business: {
      ...base.business,
      name: "Ember Candles",
      description: "Hand-poured scented candles sold online.",
      productSummary: "Hand-poured scented candles sold online.",
      offerings: ["scented candles", "gift sets"],
    },
    website: { ...base.website, type: "ecommerce", requiredPages: ["Home", "Shop", "Contact"] },
  });
}

const hospitalProject = {
  id: "proj-hospital",
  name: "Northside",
  businessName: "Northside Health",
  websiteType: "business",
};

describe("buildWebsiteSpecification", () => {
  it("turns a hospital request into a healthcare specification without ecommerce pages", () => {
    const spec = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements(),
    });

    expect(spec.project.archetype).toBe("healthcare");
    const paths = spec.pages.map((page) => page.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/doctors");
    expect(paths).not.toContain("/shop");
    expect(paths).not.toContain("/cart");
    expect(paths).not.toContain("/checkout");

    // Every page is described, not just named.
    for (const page of spec.pages) {
      expect(page.purpose.length).toBeGreaterThan(0);
      expect(page.requiredSections.length).toBeGreaterThan(0);
      expect(page.requiredContent.length).toBeGreaterThan(0);
    }
  });

  it("lists the domain exclusions the model must never generate", () => {
    const spec = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements(),
    });
    const exclusions = spec.explicitExclusions.join("\n").toLowerCase();

    expect(exclusions).toContain("shopping cart");
    expect(exclusions).toContain("checkout");
    expect(exclusions).toContain("food-service");
    expect(exclusions).toContain("invented doctors");
    expect(exclusions).toContain("invented medical statistics");
    expect(exclusions).toContain("another luvify project");
  });

  it("keeps unknown information unknown instead of inventing doctors or departments", () => {
    const spec = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements(),
    });
    const unknowns = spec.unknowns.join("\n").toLowerCase();

    expect(unknowns).toContain("doctor names");
    expect(unknowns).toContain("departments");
    expect(unknowns).toContain("appointment availability");
  });

  it("makes the latest explicit client correction override domain defaults", () => {
    const spec = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements({
        changeRequests: ["Use these three pages only: Home, Doctors, Contact"],
      }),
    });

    expect(spec.pages.map((page) => page.path).sort()).toEqual(["/", "/contact", "/doctors"]);
    expect(spec.changeRequests).toContain("Use these three pages only: Home, Doctors, Contact");
  });

  it("narrows pages when the latest conversation explicitly lists only some pages", () => {
    const spec = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements(),
      conversation: [
        { role: "assistant", content: "Which pages would you like?" },
        { role: "user", content: "Use only these pages please: Home and Contact" },
      ],
    });

    expect(spec.pages.map((page) => page.path).sort()).toEqual(["/", "/contact"]);
    expect(spec.changeRequests).toContain("Use only these pages please: Home and Contact");
  });

  it("records explicit exclusions stated by the client", () => {
    const spec = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements({
        changeRequests: ["Don't include online booking or patient testimonials."],
      }),
    });
    const exclusions = spec.explicitExclusions.join("\n").toLowerCase();
    expect(exclusions).toContain("online booking");
    expect(exclusions).toContain("patient testimonials");
  });

  it("describes each uploaded asset by what it actually represents", () => {
    const spec = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements(),
      assets: [
        { filename: "logo.png", kind: "LOGO", category: "brand.logo" },
        { filename: "clinic-interior.jpg", kind: "PHOTO", category: "media.gallery" },
        { filename: "doctors.csv", kind: "DOCUMENT", category: "" },
      ],
    });

    expect(spec.assets).toEqual([
      expect.objectContaining({ filename: "logo.png", meaning: "official business logo" }),
      expect.objectContaining({ filename: "clinic-interior.jpg", meaning: "gallery photo supplied by the business" }),
      expect.objectContaining({ filename: "doctors.csv", meaning: expect.stringContaining("structured data file") }),
    ]);
  });

  it("never lets another project's facts enter the specification", () => {
    const hospital = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements(),
    });
    const candles = buildWebsiteSpecification({
      project: { id: "proj-candles", name: "Ember", businessName: "Ember Candles", websiteType: "ecommerce" },
      requirements: candleRequirements(),
    });

    const hospitalText = JSON.stringify(hospital).toLowerCase();
    const candleText = JSON.stringify(candles).toLowerCase();
    expect(hospitalText).not.toContain("ember candles");
    expect(hospitalText).not.toContain("scented candles");
    expect(candleText).not.toContain("northside");
    expect(candleText).not.toContain("care@northside.test");
    expect(candleText).not.toContain("hospital");
    expect(candleText).not.toContain("doctor");
    expect(hospitalText).not.toContain("candle");
  });

  it("rejects a knowledge object that belongs to a different project", () => {
    const foreign = buildWebsiteSpecification({
      project: { id: "proj-a", name: "A", businessName: "A Clinic", websiteType: "business" },
      requirements: hospitalRequirements(),
    });
    expect(() =>
      buildWebsiteSpecification({
        project: { id: "proj-b", name: "B", businessName: "B Clinic", websiteType: "business" },
        requirements: hospitalRequirements(),
        knowledge: {
          ...buildSpecificationKnowledge(hospitalRequirements(), "proj-a"),
        },
      }),
    ).toThrow(/isolation/i);
    expect(foreign.project.id).toBe("proj-a");
  });
});

/** Local knowledge helper so the isolation test does not rely on module state. */
function buildSpecificationKnowledge(requirements: Requirements, projectId: string) {
  const spec = buildWebsiteSpecification({
    project: { id: projectId, name: "Source", businessName: "Source", websiteType: "business" },
    requirements,
  });
  return {
    projectId: spec.project.id,
    businessName: spec.business.name,
    summary: spec.project.purpose,
    websiteType: spec.project.websiteType,
    archetype: spec.project.archetype,
    targetAudience: spec.project.targetAudience,
    problem: "",
    products: spec.business.products,
    services: spec.business.services,
    team: [],
    offerings: spec.business.offerings,
    features: spec.requiredFunctionality,
    benefits: [],
    valueProposition: spec.business.valueProposition,
    brandVoice: "",
    brandKeywords: [],
    locations: [],
    contact: {
      ...spec.business.contact,
      known: { email: true, phone: false, address: false, hours: false },
    },
    pricing: { hasPricing: false, items: [], currency: "", paymentProvider: "", notes: "" },
    policies: { shipping: "", shippingRegions: [], returns: "", notes: "" },
    testimonials: [],
    faqs: [],
    statistics: [],
    certifications: [],
    awards: [],
    claims: [],
    requiredPages: spec.pages.map((page) => page.name),
    userJourneys: [],
    clientContent: { headline: "", subheadline: "", about: "" },
    knownFacts: spec.userProvidedFacts,
    unknowns: spec.unknowns,
    contentGaps: [],
  };
}

function huntCultureRequirements(): Requirements {
  const base = emptyRequirements("ecommerce");
  return RequirementsSchema.parse({
    ...base,
    business: {
      ...base.business,
      name: "Hunt Culture",
      description: "Hunt Culture is an independent streetwear label selling heavyweight T-shirts and hoodies.",
      productSummary: "Independent streetwear label selling heavyweight T-shirts and hoodies.",
      industry: "Clothing and fashion",
      targetAudience: "Streetwear shoppers in India",
    },
    website: {
      ...base.website,
      type: "ecommerce",
      purpose: "Sell the clothing catalogue online and build trust with first-time shoppers.",
      primaryGoal: "Sell products",
      conversionAction: "Shop the collection",
      requiredPages: ["Home", "Shop", "Product", "Contact"],
    },
    content: {
      ...base.content,
      contact: { ...base.content.contact, email: "hello@huntculture.test" },
    },
  });
}

const huntCultureProject = {
  id: "proj-hunt-culture",
  name: "Hunt Culture",
  businessName: "Hunt Culture",
  websiteType: "ecommerce",
};

describe("buildGenerationPrompt", () => {
  it("renders the complete detailed specification, not raw user input", () => {
    const spec = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements(),
    });
    const prompt = buildGenerationPrompt(spec);

    expect(spec.promptVersion).toBe(GENERATION_PROMPT_VERSION);
    expect(prompt).toContain("LUVIFY WEBSITE GENERATION SPECIFICATION");
    expect(prompt).toContain("PROMPT VERSION: v3");
    expect(prompt).toContain("PROJECT\nID: proj-hospital");
    expect(prompt).toContain("PRIMARY OBJECTIVE");
    expect(prompt).toContain("TARGET AUDIENCE");
    expect(prompt).toContain("BUSINESS INFORMATION");
    expect(prompt).toContain("USER-PROVIDED FACTS");
    expect(prompt).toContain("REQUIRED PAGES");
    expect(prompt).toContain("PAGE-BY-PAGE REQUIREMENTS");
    expect(prompt).toContain("FUNCTIONAL REQUIREMENTS");
    expect(prompt).toContain("NAVIGATION REQUIREMENTS");
    expect(prompt).toContain("CROSS-PAGE CONSISTENCY REQUIREMENTS");
    expect(prompt).toContain("CTA REQUIREMENTS");
    expect(prompt).toContain("IMAGE REQUIREMENTS");
    expect(prompt).toContain("DESIGN REQUIREMENTS");
    expect(prompt).toContain("REAL ASSETS");
    expect(prompt).toContain("STRICT CONTENT RULES");
    expect(prompt).toContain("EXPLICIT EXCLUSIONS - DO NOT GENERATE");
    expect(prompt).toContain("UNKNOWN INFORMATION - DO NOT INVENT");
    expect(prompt).toContain("RESPONSIVE REQUIREMENTS");
    expect(prompt).toContain("ACCESSIBILITY REQUIREMENTS");
    expect(prompt).toContain("GENERATION REQUIREMENTS");
    expect(prompt).toContain("Missing information is NOT permission to invent");
    expect(prompt.length).toBeGreaterThan(4_000);
  });

  it("describes every page individually and connects navigation to generated routes", () => {
    const spec = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements(),
    });
    const prompt = buildGenerationPrompt(spec);

    for (const page of spec.pages) {
      expect(prompt).toContain(`Path: ${page.path}`);
      expect(prompt).toContain(`Purpose: ${page.purpose}`);
    }
    for (const route of spec.navigation.primary) {
      expect(prompt).toContain(`${route.label} -> ${route.path}`);
    }
    expect(spec.navigation.allRoutes).toHaveLength(spec.pages.length);
    expect(spec.navigation.ctaRoutes.length).toBeGreaterThan(0);
  });

  it("does not leak another project into the final prompt", () => {
    const spec = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements(),
    });
    const prompt = buildGenerationPrompt(spec).toLowerCase();
    expect(prompt).not.toContain("ember candles");
    expect(prompt).not.toContain("scented candles");
    expect(prompt).not.toContain("candle business");
  });
});

describe("Hunt Culture clothing specification", () => {
  it("uses clothing guidance and records missing catalogue facts as unknowns", () => {
    const spec = buildWebsiteSpecification({
      project: huntCultureProject,
      requirements: huntCultureRequirements(),
    });

    expect(spec.project.archetype).toBe("ecommerce");
    expect(spec.industry.profileId).toBe("clothing");
    expect(spec.industry.confidence).toBe("explicit");
    expect(spec.business.products).toEqual([]);

    const missingIds = spec.industry.missingRequiredInformation.map((item) => item.id);
    expect(missingIds).toEqual(
      expect.arrayContaining(["products", "prices", "sizes", "colors", "product_images", "shipping_returns"]),
    );
    expect(spec.unknowns.join("\n").toLowerCase()).toContain("product catalogue with names");
    expect(spec.unknowns.join("\n").toLowerCase()).toContain("product prices");

    const prompt = buildGenerationPrompt(spec);
    expect(prompt).toContain("Profile: Clothing / fashion ecommerce (clothing; explicit)");
    expect(prompt).toContain("Product catalogue with names - Do not invent products or garment names.");
    expect(prompt).toContain("Product photos - Use honest image placeholders where a product photo is missing.");
    expect(prompt).toContain("No products supplied.");
    expect(prompt).toContain("Available sizes");
    expect(prompt).toContain("Available colours");
    expect(prompt).toContain("Missing information (must stay missing or use an editable placeholder)");
  });

  it("keeps supplied product options and images in the specification and prompt", () => {
    const requirements = huntCultureRequirements();
    requirements.ecommerce.products = [
      {
        name: "Heavyweight Tee",
        description: "Boxy heavyweight cotton tee.",
        price: "₹1,499",
        category: "T-Shirts",
        sizes: ["S", "M", "L"],
        colors: ["Bone", "Black"],
        variants: ["Oversized fit"],
        imageUrl: "https://cdn.example.test/heavyweight-tee.jpg",
      },
    ];

    const spec = buildWebsiteSpecification({ project: huntCultureProject, requirements });
    const prompt = buildGenerationPrompt(spec);

    expect(spec.business.products[0]).toEqual(
      expect.objectContaining({
        name: "Heavyweight Tee",
        sizes: ["S", "M", "L"],
        colors: ["Bone", "Black"],
        variants: ["Oversized fit"],
        imageUrl: "https://cdn.example.test/heavyweight-tee.jpg",
      }),
    );
    expect(prompt).toContain("sizes: S/M/L");
    expect(prompt).toContain("colours: Bone/Black");
    expect(prompt).toContain("variants: Oversized fit");
    expect(prompt).toContain("[image: https://cdn.example.test/heavyweight-tee.jpg]");
  });

  it("turns a darker visual change request into an explicit design direction", () => {
    const requirements = huntCultureRequirements();
    requirements.website.changeRequests = ["Make the design darker with higher contrast."];
    const spec = buildWebsiteSpecification({ project: huntCultureProject, requirements });
    const prompt = buildGenerationPrompt(spec);

    expect(spec.design.style).toContain("darker");
    expect(spec.design.mood).toContain("darker");
    expect(prompt).toContain("LATEST USER CORRECTIONS (highest priority)");
    expect(prompt).toContain("Make the design darker with higher contrast.");
  });

  it("validates a document rendered from the same approved page plan", () => {
    const requirements = huntCultureRequirements();
    const generationSpec = buildWebsiteSpecification({
      project: huntCultureProject,
      requirements,
    });
    const specification = buildSpecification({
      siteName: "Hunt Culture",
      websiteType: "ecommerce",
      requirements,
      provider: "mock",
      version: 1,
      requestedPages: generationSpec.pages.map((page) => page.name),
    });
    const document = buildDocument({
      project: {
        name: "Hunt Culture",
        businessName: "Hunt Culture",
        websiteType: "ecommerce",
        templateId: null,
      },
      requirements,
      specification,
      versionNumber: 1,
      provider: "mock",
    });

    const result = validateGeneratedDocument(generationSpec, document);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("flags missing pages and broken navigation instead of accepting them", () => {
    const spec = buildWebsiteSpecification({
      project: huntCultureProject,
      requirements: huntCultureRequirements(),
    });
    const broken = {
      pages: [{ path: "/", name: "Home", sections: [] }],
      navigation: [{ label: "Shop", path: "/shop", external: false }],
    } as unknown as Parameters<typeof validateGeneratedDocument>[1];

    const result = validateGeneratedDocument(spec, broken);
    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("required page is missing");
    expect(result.issues.join("\n")).toContain("navigation link points to a missing page");
  });
});

describe("validateWebsiteSpecification", () => {
  it("accepts a complete project specification", () => {
    const spec = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements(),
    });
    const result = validateWebsiteSpecification(spec);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("reports critical omissions instead of silently inventing context", () => {
    const spec = buildWebsiteSpecification({
      project: hospitalProject,
      requirements: hospitalRequirements(),
    });
    const broken = {
      ...spec,
      project: { ...spec.project, id: "", websiteType: "", purpose: "" },
      business: { ...spec.business, description: "", valueProposition: "" },
      pages: [],
      navigation: { primary: [], allRoutes: [], ctaRoutes: [] },
      explicitExclusions: [],
      contentRules: [],
      responsiveRequirements: [],
      accessibilityRequirements: [],
      ctaRequirements: [],
      imageRequirements: [],
      crossPageConsistency: [],
    };
    const result = validateWebsiteSpecification(broken);
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("project id");
    expect(result.issues.join(" ")).toContain("purpose");
    expect(result.issues.join(" ")).toContain("required pages");
    expect(result.issues.join(" ")).toContain("exclusions");
    expect(result.issues.join(" ")).toContain("accessibility requirements");
    expect(result.issues.join(" ")).toContain("cross-page consistency");
  });
});
