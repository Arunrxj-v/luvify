import { describe, expect, it } from "vitest";
import {
  RequirementsSchema,
  analyzeIndustryGaps,
  emptyRequirements,
  resolveIndustryProfile,
  type Requirements,
} from "../src";

function clothingRequirements(): Requirements {
  const base = emptyRequirements("ecommerce");
  return RequirementsSchema.parse({
    ...base,
    business: {
      ...base.business,
      name: "Hunt Culture",
      description: "Hunt Culture is an independent streetwear label selling heavyweight T-shirts and hoodies.",
      productSummary: "Independent streetwear label selling heavyweight T-shirts and hoodies.",
      targetAudience: "Streetwear shoppers",
    },
    website: { ...base.website, type: "ecommerce" },
    content: {
      ...base.content,
      contact: { ...base.content.contact, email: "hello@huntculture.test" },
    },
  });
}

describe("resolveIndustryProfile", () => {
  it.each([
    ["clothing", "clothing"],
    ["ecommerce", "ecommerce"],
    ["restaurant", "restaurant"],
    ["hotel", "hotel"],
    ["portfolio", "portfolio"],
    ["professional services", "professional-services"],
    ["creative agency", "agency"],
    ["saas", "saas"],
  ])("resolves %s to the %s profile", (industry, expected) => {
    expect(resolveIndustryProfile({ industry }).profile.id).toBe(expected);
  });

  it("treats an explicit archetype as authoritative over generic platform words", () => {
    const resolution = resolveIndustryProfile({
      websiteType: "business",
      archetype: "healthcare",
      description: "A hospital appointment booking platform connecting patients with doctors.",
    });
    expect(resolution.profile.id).toBe("professional-services");
    expect(resolution.confidence).toBe("explicit");
  });

  it("does not match clothing inside unrelated words such as software", () => {
    const resolution = resolveIndustryProfile({
      description: "A SaaS software platform that helps small teams manage payroll.",
    });
    expect(resolution.profile.id).toBe("saas");
    expect(resolution.matchedKeywords).not.toContain("wear");
  });

  it("prefers clothing when an explicit fashion ecommerce industry is supplied", () => {
    expect(resolveIndustryProfile({ industry: "fashion ecommerce" }).profile.id).toBe("clothing");
  });

  it("refines generic ecommerce to clothing only when garment terms are present", () => {
    const clothing = resolveIndustryProfile({
      websiteType: "ecommerce",
      archetype: "ecommerce",
      productSummary: "Heavyweight hoodies and T-shirts for a streetwear label.",
    });
    const generic = resolveIndustryProfile({
      websiteType: "ecommerce",
      archetype: "ecommerce",
      productSummary: "Hand-poured scented candles sold online.",
    });
    expect(clothing.profile.id).toBe("clothing");
    expect(generic.profile.id).toBe("ecommerce");
  });
});

describe("analyzeIndustryGaps", () => {
  it("reports missing clothing facts instead of filling them in", () => {
    const gaps = analyzeIndustryGaps(clothingRequirements(), { archetype: "ecommerce" });
    const missing = gaps.missingRequiredInformation.map((item) => item.id);

    expect(gaps.profile.id).toBe("clothing");
    expect(missing).toContain("products");
    expect(missing).toContain("prices");
    expect(missing).toContain("sizes");
    expect(missing).toContain("colors");
    expect(missing).toContain("product_images");
    expect(missing).toContain("shipping_returns");
    expect(gaps.missingAssets.map((item) => item.id)).toContain("product_photos");
  });

  it("uses the property description and room imagery instead of reporting them missing", () => {
    const base = emptyRequirements("business");
    const requirements = RequirementsSchema.parse({
      ...base,
      business: {
        ...base.business,
        name: "Harbour House",
        description: "A boutique hotel with check-in from 2pm and check-out at 11am.",
        productSummary: "Boutique hotel rooms and suites in Fort Kochi.",
        targetAudience: "Weekend travellers",
      },
      website: { ...base.website, type: "business" },
      content: {
        ...base.content,
        contact: { ...base.content.contact, email: "stay@harbourhouse.test" },
      },
    });
    requirements.content.products = [
      {
        name: "Harbour Suite",
        description: "Suite with a balcony",
        price: "₹8,500",
        category: "Suite",
        sizes: [],
        colors: [],
        variants: [],
        imageUrl: "https://cdn.test/harbour-suite.jpg",
      },
    ];
    const gaps = analyzeIndustryGaps(requirements, { archetype: "hotel" });
    const missing = gaps.missingRequiredInformation.map((item) => item.id);
    expect(gaps.profile.id).toBe("hotel");
    expect(missing).not.toContain("checkin_checkout");
    expect(missing).not.toContain("room_photos");
  });

  it("counts supplied product variants, imagery and policies as provided", () => {
    const requirements = clothingRequirements();
    requirements.ecommerce.products = [
      {
        name: "Heavyweight Tee",
        description: "Boxy cotton tee",
        price: "₹1,499",
        category: "T-shirts",
        sizes: ["S", "M", "L"],
        colors: ["Black"],
        variants: ["Oversized"],
        imageUrl: "https://cdn.test/tee.jpg",
      },
    ];
    requirements.ecommerce.shipping.notes = "Ships across India in 3-5 days.";
    const gaps = analyzeIndustryGaps(requirements, {
      archetype: "ecommerce",
      assets: [{ filename: "heavyweight-tee.jpg", kind: "PHOTO", category: "product" }],
      extraFacts: ["sizes S to XL", "colours black and bone", "shipping and returns"],
    });
    const missing = gaps.missingRequiredInformation.map((item) => item.id);

    expect(missing).not.toContain("products");
    expect(missing).not.toContain("prices");
    expect(missing).not.toContain("sizes");
    expect(missing).not.toContain("colors");
    expect(missing).not.toContain("product_images");
    expect(missing).not.toContain("shipping_returns");
  });
});
