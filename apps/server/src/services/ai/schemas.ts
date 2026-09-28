/**
 * Structured output contracts for the AI layer.
 *
 * These schemas - not the model - define what may enter the pipeline. Anything
 * the model returns is validated here first, which is what stops arbitrary
 * prose or an invented component schema from reaching the renderer.
 *
 * The shapes mirror the existing domain types in `@luvify/shared`
 * (`Requirements`, `WebsiteSpecification.architecture`, the `Section` union),
 * so AI output is applied onto the current structures rather than replacing
 * them.
 */

import { z } from "zod";

const text = z.string().default("");
const trimmed = z.string().trim();
const stringList = z.array(z.string().trim().min(1)).default([]);

// ---------------------------------------------------------------------------
// 1. Requirement extraction (client chat -> project knowledge)
// ---------------------------------------------------------------------------

export const RequirementUpdateSchema = z.object({
  /** What the business is, in the client's own terms. */
  businessSummary: text,
  valueProposition: text,
  targetAudience: text,
  coreProblem: text,
  industry: text,
  offerings: stringList,
  features: stringList,
  requiredPages: stringList,
  primaryGoal: text,
  conversionAction: text,
  toneOfVoice: text,
  headline: text,
  subheadline: text,
  about: text,
  services: z.array(z.object({ name: trimmed.min(1), description: text, price: text })).default([]),
  products: z
    .array(z.object({ name: trimmed.min(1), description: text, price: text, category: text }))
    .default([]),
  contact: z.object({ email: text, phone: text, address: text, hours: text }).default({}),
  /** Client-stated removals ("we no longer sell hoodies"). */
  removals: stringList,
});

export type RequirementUpdate = z.infer<typeof RequirementUpdateSchema>;

// ---------------------------------------------------------------------------
// 2. Website architecture (requirements -> page plan)
// ---------------------------------------------------------------------------

export const ArchitecturePlanSchema = z.object({
  /** Domain archetype, e.g. healthcare / ecommerce / restaurant / saas. */
  archetype: trimmed.min(1),
  websiteType: text,
  businessSummary: text,
  coreProblem: text,
  valueProposition: text,
  targetAudience: text,
  features: stringList,
  pages: z
    .array(
      z.object({
        name: trimmed.min(1),
        path: text,
        purpose: text,
        /** What this page must contain, decided per project. */
        contentRequirements: stringList,
      }),
    )
    .min(1),
  userJourneys: z.array(z.object({ goal: trimmed.min(1), steps: stringList })).default([]),
});

export type ArchitecturePlan = z.infer<typeof ArchitecturePlanSchema>;

// ---------------------------------------------------------------------------
// 3. Per-page copy (architecture -> renderer-compatible section content)
// ---------------------------------------------------------------------------

/**
 * Copy for one page, keyed by the section types the renderer already supports.
 * Only fields the corresponding section schema exposes are accepted, so the
 * model cannot invent components or props.
 */
export const PageCopySchema = z.object({
  title: text,
  description: text,
  sections: z
    .object({
      hero: z
        .object({
          eyebrow: text,
          title: trimmed.min(1),
          subtitle: text,
          primaryCtaLabel: text,
          trustLine: text,
        })
        .optional(),
      about: z
        .object({ eyebrow: text, title: text, body: stringList, highlights: stringList })
        .optional(),
      features: z
        .object({
          eyebrow: text,
          title: text,
          subtitle: text,
          items: z.array(z.object({ title: trimmed.min(1), description: text })).default([]),
        })
        .optional(),
      services: z
        .object({
          eyebrow: text,
          title: text,
          subtitle: text,
          items: z
            .array(
              z.object({
                title: trimmed.min(1),
                description: text,
                price: text,
                duration: text,
                bulletPoints: stringList,
              }),
            )
            .default([]),
        })
        .optional(),
      faq: z
        .object({
          eyebrow: text,
          title: text,
          subtitle: text,
          items: z.array(z.object({ question: trimmed.min(1), answer: text })).default([]),
        })
        .optional(),
      cta: z.object({ eyebrow: text, title: trimmed.min(1), body: text, buttonLabel: text }).optional(),
      contact: z.object({ eyebrow: text, title: text, subtitle: text }).optional(),
      gallery: z.object({ eyebrow: text, title: text, subtitle: text }).optional(),
      testimonials: z
        .object({
          eyebrow: text,
          title: text,
          items: z.array(z.object({ quote: trimmed.min(1), author: text, role: text })).default([]),
        })
        .optional(),
      team: z
        .object({
          eyebrow: text,
          title: text,
          subtitle: text,
          members: z.array(z.object({ name: trimmed.min(1), role: text, bio: text })).default([]),
        })
        .optional(),
      blog: z
        .object({
          eyebrow: text,
          title: text,
          subtitle: text,
          posts: z
            .array(z.object({ title: trimmed.min(1), excerpt: text, category: text }))
            .default([]),
        })
        .optional(),
    })
    .default({}),
});

export type PageCopy = z.infer<typeof PageCopySchema>;

// ---------------------------------------------------------------------------
// 4. Content validation (generated copy -> accept / revise / reject)
// ---------------------------------------------------------------------------

export const ContentValidationSchema = z.object({
  /** Does the content belong to this project and this page? */
  relevant: z.boolean(),
  /** 0-100 relevance to the page's purpose and the approved summary. */
  relevanceScore: z.number().min(0).max(100).default(100),
  /** Sentences asserting details the client never provided. */
  unsupportedFacts: stringList,
  /** Content that belongs to a different kind of business. */
  unrelatedContent: stringList,
  issues: stringList,
  verdict: z.enum(["accept", "revise", "reject"]),
  reason: text,
});

export type ContentValidation = z.infer<typeof ContentValidationSchema>;

