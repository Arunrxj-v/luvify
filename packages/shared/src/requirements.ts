import { z } from "zod";
import type { WebsiteType } from "./enums";

/**
 * The structured requirements model that lives *behind* the chat.
 *
 * The interviewer's job is to fill this object; nothing else in the pipeline
 * reads the raw conversation. Every field has a default so that partial AI
 * output can be validated, merged and re-checked for completeness.
 */

const text = z.string().trim().default("");
const stringList = z.array(z.string().trim().min(1)).default([]);

export const ServiceItemSchema = z.object({
  name: text,
  description: text,
  price: text,
});
export type ServiceItem = z.infer<typeof ServiceItemSchema>;

export const ProductItemSchema = z.object({
  name: text,
  description: text,
  price: text,
  category: text,
});
export type ProductItem = z.infer<typeof ProductItemSchema>;

export const TestimonialItemSchema = z.object({
  quote: text,
  author: text,
  role: text,
});
export type TestimonialItem = z.infer<typeof TestimonialItemSchema>;

export const FaqItemSchema = z.object({
  question: text,
  answer: text,
});
export type FaqItem = z.infer<typeof FaqItemSchema>;

export const PagePlanItemSchema = z.object({
  name: z.string().trim().min(1),
  path: z.string().trim().min(1),
  purpose: z.string().trim().default(""),
});
export type PagePlanItem = z.infer<typeof PagePlanItemSchema>;

export const UserJourneySchema = z.object({
  goal: z.string().trim().min(1),
  steps: z.array(z.string().trim().min(1)).default([]),
});
export type UserJourney = z.infer<typeof UserJourneySchema>;

export const RequirementsSchema = z.object({
  business: z
    .object({
      name: text,
      description: text,
      /**
       * Concise, information-dense statement of what the client is asking
       * Luvify to build ("A bakery specializing in custom wedding cakes and
       * birthday cakes"). This is the PRIMARY SOURCE OF TRUTH for generation:
       * every page, section and CTA is grounded in it. Derive it from what the
       * client actually said - never generic marketing copy.
       */
      productSummary: text,
      /** What the business offers, each as short client-grounded phrases. */
      offerings: stringList,
      /** The client's own value proposition in their words. */
      valueProposition: text,
      industry: text,
      targetAudience: text,
      location: text,
      uniqueSellingPoints: stringList,
    })
    .default({}),
  website: z
    .object({
      type: text,
      purpose: text,
      primaryGoal: text,
      conversionAction: text,
      /**
       * Structural classification driving the page architecture
       * ("restaurant", "healthcare", "ecommerce", ...). Never a keyword guess:
       * it is derived from the product summary plus the full requirements and
       * falls back to "custom" when no archetype fits.
       */
      archetype: text,
      requiredPages: stringList,
      /**
       * The approved information architecture: every page that may exist,
       * each with a reason (purpose). Page generation must use this plan -
       * pages not on it are not generated.
       */
      pagePlan: z.array(PagePlanItemSchema).default([]),
      /** User journeys the architecture supports (used to justify pages). */
      userJourneys: z.array(UserJourneySchema).default([]),
      toneOfVoice: text,
      /**
       * Free-form change requests captured from the conversation ("change the
       * About page to a darker design"). They stay attached to the project and
       * are folded into the specification the next time it is built, so a
       * request made in chat is never lost.
       */
      changeRequests: stringList,
    })
    .default({}),
  branding: z
    .object({
      brandName: text,
      logo: text,
      primaryColor: text,
      secondaryColor: text,
      accentColor: text,
      fontPreference: text,
      style: text,
      existingAssets: text,
    })
    .default({}),
  content: z
    .object({
      headline: text,
      subheadline: text,
      about: text,
      services: z.array(ServiceItemSchema).default([]),
      products: z.array(ProductItemSchema).default([]),
      /**
       * Client-provided people (doctors, trainers, stylists, staff). The only
       * source the Team section may render: without it, template members are
       * invented people and the validator clears them.
       */
      team: z
        .array(
          z.object({
            name: text,
            role: text,
            bio: text,
          }),
        )
        .default([]),
      testimonials: z.array(TestimonialItemSchema).default([]),
      faq: z.array(FaqItemSchema).default([]),
      galleryNotes: text,
      socials: z
        .object({
          instagram: text,
          facebook: text,
          x: text,
          linkedin: text,
          tiktok: text,
          youtube: text,
        })
        .default({}),
      contact: z
        .object({
          email: text,
          phone: text,
          address: text,
          hours: text,
          mapUrl: text,
        })
        .default({}),
    })
    .default({}),
  features: z
    .object({
      reviewed: z.boolean().default(false),
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
  ecommerce: z
    .object({
      products: z.array(ProductItemSchema).default([]),
      currency: text,
      paymentProvider: text,
      shipping: z
        .object({
          flatRate: text,
          freeShippingThreshold: text,
          regions: stringList,
          notes: text,
        })
        .default({}),
      catalogSize: text,
      variants: text,
    })
    .default({}),
  technical: z
    .object({
      domain: text,
      hosting: text,
      seo: z
        .object({
          titleTemplate: text,
          defaultDescription: text,
          keywords: stringList,
        })
        .default({}),
      analytics: z
        .object({
          provider: text,
          trackingId: text,
        })
        .default({}),
      accessibility: text,
    })
    .default({}),
});

export type Requirements = z.infer<typeof RequirementsSchema>;

export function parseRequirements(value: unknown): Requirements {
  return RequirementsSchema.parse(value ?? {});
}

export function emptyRequirements(websiteType: string = ""): Requirements {
  return parseRequirements({ website: { type: websiteType } });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeObjects(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined || patchValue === null) continue;
    const currentValue = out[key];

    if (isPlainObject(patchValue) && isPlainObject(currentValue)) {
      out[key] = mergeObjects(currentValue, patchValue);
      continue;
    }
    if (Array.isArray(patchValue)) {
      if (patchValue.length === 0) continue;
      if (patchValue.every((entry) => typeof entry === "string")) {
        const existing = Array.isArray(currentValue) ? (currentValue as string[]) : [];
        const merged = [...existing];
        for (const entry of patchValue as string[]) {
          if (!merged.includes(entry)) merged.push(entry);
        }
        out[key] = merged;
      } else {
        out[key] = patchValue;
      }
      continue;
    }
    if (typeof patchValue === "string") {
      if (patchValue.trim() === "") continue;
      out[key] = patchValue.trim();
      continue;
    }
    out[key] = patchValue;
  }
  return out;
}

/**
 * Deep merge where supplied non-empty values win over the stored ones.
 * Empty strings / empty arrays never erase what the client already told us.
 */
export function mergeRequirements(current: Requirements, patch: Partial<Requirements> | undefined | null): Requirements {
  if (!patch) return current;
  return parseRequirements(mergeObjects(current as Record<string, unknown>, patch as Record<string, unknown>));
}

export function hasValue(value: string | undefined | null, minLength = 1): boolean {
  return typeof value === "string" && value.trim().length >= minLength;
}

export function enabledFeatures(req: Requirements): string[] {
  return Object.entries(req.features)
    .filter(([key, value]) => key !== "reviewed" && value === true)
    .map(([key]) => key);
}

export function isEcommerceProject(req: Requirements): boolean {
  return (
    req.website.type === "ecommerce" ||
    req.features.ecommerce ||
    req.features.payments ||
    req.ecommerce.products.length > 0 ||
    req.content.products.length > 0
  );
}

