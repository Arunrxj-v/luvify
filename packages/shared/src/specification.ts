import { z } from "zod";
import { SECTION_TYPES } from "./enums";
import { ProjectKnowledgeSchema, type ProjectKnowledge } from "./knowledge";

/**
 * WebsiteSpecification - the structured contract produced *before* any code is
 * generated. The generator turns this into a SiteDocument (sections + content).
 */

const text = z.string().default("");
const stringList = z.array(z.string()).default([]);

export const ProjectContextSchema = z.object({
  siteName: z.string().default(""),
  businessName: z.string().default(""),
  productSummary: z.string().default(""),
  offerings: z.array(z.string()).default([]),
  valueProposition: z.string().default(""),
  industry: z.string().default(""),
  targetAudience: z.string().default(""),
  primaryGoal: z.string().default(""),
  conversionAction: z.string().default(""),
  toneOfVoice: z.string().default(""),
  archetype: z.string().default("custom"),
  contact: z
    .object({
      email: z.string().default(""),
      phone: z.string().default(""),
      address: z.string().default(""),
      hours: z.string().default(""),
    })
    .default({}),
});
export type ProjectContext = z.infer<typeof ProjectContextSchema>;

export const SpecificationPageSchema = z.object({
  id: z.string().default(""),
  name: z.string().min(1),
  path: z
    .string()
    .default("/")
    .transform((value) => (value.startsWith("/") ? value : `/${value}`)),
  title: text,
  description: text,
  purpose: text,
  sections: z.array(z.enum(SECTION_TYPES)).default([]),
  /**
   * Page-specific content plan: the known facts the page may use, the
   * unknowns it must not invent, and what it must / must not do.
   */
  contentPlan: z
    .object({
      knownFacts: z.array(z.string()).default([]),
      unknowns: z.array(z.string()).default([]),
      doList: z.array(z.string()).default([]),
      doNotList: z.array(z.string()).default([]),
    })
    .default({}),
});
export type SpecificationPage = z.infer<typeof SpecificationPageSchema>;

const hexOrDefault = (fallback: string) => z.string().default(fallback);

export const WebsiteSpecificationSchema = z.object({
  siteName: z.string().min(1),
  siteType: z.string().default("business"),
  tagline: text,
  summary: text,
  /** Shared generation context: every page is built from this same object. */
  projectContext: ProjectContextSchema.default({ siteName: "" }),
  /**
   * Project knowledge - the structured source of truth. Every factual item is
   * traceable to client information or explicitly marked unknown; generation
   * and validation both read from it. Defaulted so specifications stored
   * before this field existed still parse.
   */
  knowledge: ProjectKnowledgeSchema.default({ projectId: "" }),
  /** The approved website architecture: page generation must follow it. */
  architecture: z
    .object({
      archetype: z.string().default("custom"),
      pages: z.array(SpecificationPageSchema).default([]),
      userJourneys: z
        .array(
          z.object({
            goal: z.string().min(1),
            steps: z.array(z.string()).default([]),
          }),
        )
        .default([]),
    })
    .default({ archetype: "custom", pages: [], userJourneys: [] }),
  targetAudience: text,
  primaryGoal: text,
  conversionAction: text,
  pages: z.array(SpecificationPageSchema).min(1),
  design: z
    .object({
      style: z.string().default("modern"),
      mood: text,
      layout: z.string().default("centred container, generous spacing"),
      imageryDirection: text,
      radius: z.number().int().min(0).max(32).default(14),
      colors: z
        .object({
          primary: hexOrDefault("#1f6feb"),
          secondary: hexOrDefault("#0f172a"),
          accent: hexOrDefault("#f59e0b"),
          background: hexOrDefault("#ffffff"),
          foreground: hexOrDefault("#0f172a"),
        })
        .default({}),
      typography: z
        .object({
          headingFont: z.string().default("Inter"),
          bodyFont: z.string().default("Inter"),
          scale: z.string().default("1.25"),
        })
        .default({}),
    })
    .default({}),
  sections: z.record(z.string(), z.array(z.enum(SECTION_TYPES))).default({}),
  features: z
    .object({
      contactForm: z.boolean().default(false),
      booking: z.boolean().default(false),
      newsletter: z.boolean().default(false),
      authentication: z.boolean().default(false),
      payments: z.boolean().default(false),
      blog: z.boolean().default(false),
      ecommerce: z.boolean().default(false),
      search: z.boolean().default(false),
      reviews: z.boolean().default(false),
      delivery: z.boolean().default(false),
      multiLanguage: z.boolean().default(false),
      liveChat: z.boolean().default(false),
    })
    .default({}),
  contentPlan: z
    .object({
      headline: text,
      subheadline: text,
      about: text,
      toneOfVoice: text,
      serviceCount: z.number().int().min(0).default(0),
      productCount: z.number().int().min(0).default(0),
      testimonialCount: z.number().int().min(0).default(0),
      faqCount: z.number().int().min(0).default(0),
    })
    .default({}),
  seo: z
    .object({
      titleTemplate: text,
      description: text,
      keywords: stringList,
    })
    .default({}),
  commerce: z
    .object({
      enabled: z.boolean().default(false),
      currency: z.string().default("USD"),
      paymentProvider: text,
      productCount: z.number().int().min(0).default(0),
      shippingNotes: text,
      catalogNotes: text,
    })
    .default({}),
  integrations: z
    .array(
      z.object({
        name: z.string().min(1),
        purpose: text,
        status: z.enum(["planned", "manual", "ready"]).default("planned"),
      }),
    )
    .default([]),
  technical: z
    .object({
      domain: text,
      hosting: text,
      analytics: text,
      accessibility: text,
    })
    .default({}),
  version: z.number().int().default(1),
  generatedAt: z.string().default(() => new Date().toISOString()),
  provider: z.string().default("mock"),
});
export type WebsiteSpecification = z.infer<typeof WebsiteSpecificationSchema>;

export function parseWebsiteSpecification(value: unknown): WebsiteSpecification {
  return WebsiteSpecificationSchema.parse(value);
}

/** Human-readable spec summary used in prompts and in the builder's spec panel. */
export function summarizeSpecification(spec: WebsiteSpecification): string {
  const lines: string[] = [];
  lines.push(`${spec.siteName} - ${spec.siteType}${spec.tagline ? ` - "${spec.tagline}"` : ""}`);
  if (spec.projectContext?.productSummary) lines.push(`Product: ${spec.projectContext.productSummary}`);
  if (spec.knowledge) {
    const knowledge = spec.knowledge as ProjectKnowledge;
    if (knowledge.knownFacts.length > 0) {
      lines.push(`Verified facts (${knowledge.knownFacts.length}):`);
      for (const fact of knowledge.knownFacts.slice(0, 12)) lines.push(`  ✓ ${fact}`);
    }
    if (knowledge.unknowns.length > 0) {
      lines.push(`Unknown (must stay unknown): ${knowledge.unknowns.slice(0, 8).join("; ")}`);
    }
  }
  if (spec.summary) lines.push(`Summary: ${spec.summary}`);
  if (spec.architecture?.archetype && spec.architecture.archetype !== "custom") {
    lines.push(`Website type: ${spec.architecture.archetype}`);
  }
  if (spec.targetAudience) lines.push(`Audience: ${spec.targetAudience}`);
  if (spec.primaryGoal) lines.push(`Primary goal: ${spec.primaryGoal}`);
  if (spec.conversionAction) lines.push(`Conversion action: ${spec.conversionAction}`);
  lines.push(`Design: ${spec.design.style}${spec.design.mood ? ` (${spec.design.mood})` : ""}`);
  lines.push(
    `Colors: primary ${spec.design.colors.primary}, secondary ${spec.design.colors.secondary}, accent ${spec.design.colors.accent}`,
  );
  lines.push(`Typography: ${spec.design.typography.headingFont} headings / ${spec.design.typography.bodyFont} body`);
  lines.push("Pages:");
  for (const page of spec.pages) {
    lines.push(`- ${page.name} (${page.path})${page.purpose ? ` - ${page.purpose}` : ""}`);
    if (page.sections.length) lines.push(`  sections: ${page.sections.join(", ")}`);
  }
  const features = Object.entries(spec.features)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
  if (features.length) lines.push(`Features: ${features.join(", ")}`);
  if (spec.commerce.enabled) {
    lines.push(
      `Commerce: ${spec.commerce.productCount} products, currency ${spec.commerce.currency}, payments ${spec.commerce.paymentProvider || "undecided"}`,
    );
  }
  if (spec.seo.description) lines.push(`SEO: ${spec.seo.description}`);
  if (spec.seo.keywords.length) lines.push(`Keywords: ${spec.seo.keywords.join(", ")}`);
  if (spec.technical.domain) lines.push(`Domain: ${spec.technical.domain}`);
  return lines.join("\n");
}
