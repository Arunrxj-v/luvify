/**
 * Unit tests for the deterministic generation core: specification derivation,
 * document building through the template registry and the interview ordering.
 * These paths never touch the database.
 */

import { describe, expect, it } from "vitest";
import { RequirementsSchema, emptyRequirements } from "@luvify/shared";
import { buildDocument, buildSpecification, diffDocuments, resolveTemplateId } from "../src/generate";
import { INTERVIEW_QUESTIONS, nextQuestion } from "../src/interview";

function sampleRequirements() {
  const base = emptyRequirements("restaurant");
  return RequirementsSchema.parse({
    ...base,
    business: {
      ...base.business,
      name: "Harbour Bakery",
      description: "A neighbourhood bakery selling sourdough bread and celebration cakes every day.",
      industry: "Food & drink",
    },
    website: { ...base.website, type: "restaurant", requiredPages: ["Home", "Menu", "Contact"] },
    branding: { ...base.branding, brandName: "Harbour Bakery", primaryColor: "#b45309", style: "warm" },
    content: {
      ...base.content,
      headline: "Fresh bread, every morning",
      contact: { ...base.content.contact, email: "hi@harbour.test" },
    },
  });
}

describe("buildSpecification", () => {
  it("derives pages from requiredPages with section lists", () => {
    const spec = buildSpecification({
      siteName: "Harbour Bakery",
      websiteType: "restaurant",
      requirements: sampleRequirements(),
      provider: "mock",
      version: 2,
    });

    expect(spec.pages.map((page) => page.path)).toEqual(["/", "/menu", "/contact"]);
    expect(spec.pages[0]?.sections).toContain("Hero");
    expect(spec.sections["/"]).toContain("Features");
    expect(spec.siteType).toBe("restaurant");
    expect(spec.version).toBe(2);
    expect(spec.design.colors.primary).toBe("#b45309");
  });

  it("falls back to the archetype architecture when no pages are requested", () => {
    const requirements = emptyRequirements("saas");
    const spec = buildSpecification({
      siteName: "Nimbus",
      websiteType: "saas",
      requirements,
      provider: "mock",
      version: 1,
    });
    // The approved architecture drives the pages, not a universal template.
    expect(spec.architecture.archetype).toBe("saas");
    expect(spec.pages.map((page) => page.path)).toEqual(["/", "/features", "/pricing", "/about", "/contact"]);
    expect(spec.architecture.pages.map((page) => page.path)).toEqual(spec.pages.map((page) => page.path));
    expect(spec.architecture.userJourneys.length).toBeGreaterThan(0);
  });

  it("classifies a hospital booking platform as healthcare, not a shop", () => {
    const base = emptyRequirements("business");
    const requirements = {
      ...base,
      business: {
        ...base.business,
        name: "Northside Health",
        description: "A hospital appointment booking platform connecting patients with doctors.",
        productSummary: "A hospital appointment platform connecting patients with doctors.",
        offerings: ["appointment booking", "specialist consultations"],
      },
    };
    const spec = buildSpecification({
      siteName: "Northside Health",
      websiteType: "business",
      requirements,
      provider: "mock",
      version: 1,
    });
    const paths = spec.pages.map((page) => page.path);
    expect(spec.architecture.archetype).toBe("healthcare");
    expect(paths).toContain("/doctors");
    expect(paths).toContain("/booking");
    expect(paths).not.toContain("/shop");
    expect(paths).not.toContain("/cart");
    expect(paths).not.toContain("/checkout");
    // Commerce scaffolding must not appear on a clinical site.
    expect(spec.features.ecommerce).toBe(false);
    expect(Object.values(spec.sections).flat()).not.toContain("ProductGrid");
    expect(spec.sections["/"]).not.toContain("Pricing");
  });
});

describe("buildDocument", () => {
  it("builds a validated SiteDocument through the template registry", () => {
    const requirements = sampleRequirements();
    const specification = buildSpecification({
      siteName: "Harbour Bakery",
      websiteType: "restaurant",
      requirements,
      provider: "mock",
      version: 1,
    });

    const document = buildDocument({
      project: { name: "Harbour Bakery", businessName: "Harbour Bakery", websiteType: "restaurant", templateId: null },
      requirements,
      specification,
      versionNumber: 3,
      provider: "mock",
    });

    expect(document.pages.length).toBeGreaterThan(0);
    expect(document.meta.versionNumber).toBe(3);
    expect(document.siteName).toBe("Harbour Bakery");
    expect(document.theme.colors.primary).toBeTruthy();
    expect(document.footer.logoText).toBe("Harbour Bakery");
  });

  it("resolves the template in request -> project -> recommendation order", () => {
    expect(resolveTemplateId({ requested: "saas", current: "agency", websiteType: "business" })).toBe("saas");
    expect(resolveTemplateId({ requested: "nope", current: "agency", websiteType: "business" })).toBe("agency");
    expect(resolveTemplateId({ requested: null, current: null, websiteType: "restaurant" })).toBe("restaurant");
  });
});

describe("diffDocuments", () => {
  it("reports no meaningful change for identical documents", () => {
    const requirements = sampleRequirements();
    const specification = buildSpecification({
      siteName: "Harbour Bakery",
      websiteType: "restaurant",
      requirements,
      provider: "mock",
      version: 1,
    });
    const project = {
      name: "Harbour Bakery",
      businessName: "Harbour Bakery",
      websiteType: "restaurant",
      templateId: null,
    };
    const first = buildDocument({ project, requirements, specification, versionNumber: 1, provider: "mock" });
    const second = buildDocument({ project, requirements, specification, versionNumber: 2, provider: "mock" });
    const diff = diffDocuments(first, second);

    expect(diff.affectedSections).toHaveLength(0);
    expect(diff.changeSummary.length).toBeGreaterThan(0);
  });
});

describe("interview", () => {
  it("asks the highest-priority unanswered question first", () => {
    const requirements = emptyRequirements("business");
    expect(nextQuestion(requirements)?.mapsTo).toBe("business.name");

    const answered = RequirementsSchema.parse({
      ...requirements,
      business: { ...requirements.business, name: "Acme" },
    });
    expect(nextQuestion(answered)?.mapsTo).toBe("business.description");
  });

  it("declares a question for every completeness category it targets", () => {
    expect(INTERVIEW_QUESTIONS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(INTERVIEW_QUESTIONS.map((question) => question.id)).size).toBe(INTERVIEW_QUESTIONS.length);
  });
});
