/**
 * Cross-domain content isolation: a hospital project must render only
 * hospital-grounded content - never agency/studio copy from a mismatched
 * template. Reproduces the reported bug end to end through the real pipeline
 * (creation resolution -> specification -> document -> alignment).
 */

import { describe, expect, it } from "vitest";
import { RequirementsSchema, emptyRequirements } from "@luvify/shared";
import { buildDocument, buildSpecification, creationTemplateId, resolveTemplateId } from "../src/generate";

const AGENCY_STRINGS = [
  "Small on purpose",
  "Strategy lead",
  "Design director",
  "Technology lead",
  "Positioning & research",
  "Identity & art direction",
  "Ten years in-house",
  "Start a project",
  "Tell us what you are building",
  "Brand strategy",
];

function hospitalRequirements() {
  const base = emptyRequirements("business");
  return RequirementsSchema.parse({
    ...base,
    business: {
      ...base.business,
      name: "Evolve Medical College",
      description: "A hospital appointment booking platform connecting patients with doctors.",
      productSummary: "A hospital appointment platform connecting patients with doctors.",
      offerings: ["appointment booking", "specialist consultations"],
      targetAudience: "patients",
    },
    website: {
      ...base.website,
      type: "business",
      conversionAction: "Book an appointment",
      requiredPages: ["Home", "Doctors", "Contact"],
    },
    branding: { ...base.branding, brandName: "Evolve Medical College" },
    content: {
      ...base.content,
      about: "We connect patients with qualified doctors across departments.",
      contact: { ...base.content.contact, email: "care@evolve.test" },
    },
  });
}

describe("hospital project content isolation", () => {
  it("does not lock an unchosen domain template at creation", () => {
    expect(creationTemplateId(undefined)).toBeNull();
    expect(creationTemplateId("restaurant")).toBe("restaurant");
    expect(creationTemplateId("nope")).toBeNull();
  });

  it("renders hospital-grounded content on every page", () => {
    const requirements = hospitalRequirements();
    const specification = buildSpecification({
      siteName: "Evolve Medical College",
      websiteType: "business",
      requirements,
      provider: "mock",
      version: 1,
    });
    expect(specification.architecture.archetype).toBe("healthcare");

    // The project carries whatever creation stored (null unless explicitly chosen).
    const templateId = creationTemplateId(undefined);
    const document = buildDocument({
      project: { name: "Evolve Medical College", businessName: "Evolve Medical College", websiteType: "business", templateId },
      requirements,
      specification,
      versionNumber: 1,
      provider: "mock",
    });

    const text = JSON.stringify(document);
    for (const banned of AGENCY_STRINGS) {
      expect(text, `hospital site renders agency copy: "${banned}"`).not.toContain(banned);
    }
    expect(text.toLowerCase()).toContain("appointment booking");
    expect(text).toContain("Evolve Medical College");

    const types = document.pages.flatMap((page) => page.sections.map((section) => section.type));
    expect(types).not.toContain("Testimonials");
    // No invented team members anywhere.
    for (const page of document.pages) {
      for (const section of page.sections) {
        if (section.type === "Team") {
          expect((section as unknown as { members: unknown[] }).members).toHaveLength(0);
        }
      }
    }
  });

  it("keeps navigation and footer links inside the approved architecture", () => {
    const requirements = hospitalRequirements();
    const specification = buildSpecification({
      siteName: "Evolve Medical College",
      websiteType: "business",
      requirements,
      provider: "mock",
      version: 1,
    });
    const document = buildDocument({
      project: { name: "Evolve Medical College", businessName: "Evolve Medical College", websiteType: "business", templateId: null },
      requirements,
      specification,
      versionNumber: 1,
      provider: "mock",
    });

    const paths = new Set(document.pages.map((page) => page.path));
    for (const page of document.pages) {
      for (const section of page.sections) {
        if (section.type === "Navbar") {
          for (const link of section.links) {
            if (!link.external) {
              expect(paths, `navbar links to dropped page ${link.path}`).toContain(link.path);
            }
          }
          if (section.cta?.path && !section.cta.path.startsWith("http")) {
            expect(paths, `navbar CTA links to dropped page ${section.cta.path}`).toContain(section.cta.path);
          }
        }
      }
    }
    for (const column of document.footer.columns ?? []) {
      for (const link of column.links) {
        if (!link.external) {
          expect(paths, `footer links to dropped page ${link.path}`).toContain(link.path);
        }
      }
    }
    // No stale agency labels.
    const labels = document.pages
      .flatMap((page) => page.sections)
      .filter((section) => section.type === "Navbar")
      .flatMap((section) => (section as unknown as { links: Array<{ label: string }> }).links.map((link) => link.label));
    expect(labels).not.toContain("Work");
    expect(labels).not.toContain("Studio");
  });

  it("still honours an explicitly chosen template", () => {
    expect(resolveTemplateId({ requested: "portfolio", current: null, websiteType: "business" })).toBe("portfolio");
    expect(creationTemplateId("portfolio")).toBe("portfolio");
  });
});
