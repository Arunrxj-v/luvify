/**
 * Converts an AI requirement update into the nested patch shape the existing
 * chat pipeline already understands.
 *
 * The chat route merges this with `mergeRequirements`, so reusing the same
 * shape means the AI path goes through exactly the same validation, correction
 * and derivation steps as the deterministic one - no parallel code path.
 */

import {
  detectFeatures,
  type Requirements,
} from "@luvify/shared";
import type { RequirementUpdate } from "./schemas";

/** Drops empty values so a patch never clears information the client already gave. */
function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = typeof value === "string" ? value.trim() : value;
  }
  return out as Partial<T>;
}

/** Turns the model's flat-ish update into a nested `Partial<Requirements>`. */
export function requirementUpdateToPatch(
  update: RequirementUpdate,
  current: Requirements,
): Partial<Requirements> {
  const business = compact({
    description: update.businessSummary,
    productSummary: update.businessSummary,
    valueProposition: update.valueProposition,
    targetAudience: update.targetAudience,
    industry: update.industry,
    offerings: update.offerings,
  });

  const website = compact({
    primaryGoal: update.primaryGoal,
    conversionAction: update.conversionAction,
    toneOfVoice: update.toneOfVoice,
    requiredPages: update.requiredPages,
  });

  const services = update.services
    .filter((service) => service.name.trim().length > 0)
    .map((service) => ({ name: service.name, description: service.description, price: service.price }));

  const products = update.products
    .filter((product) => product.name.trim().length > 0)
    .map((product) => ({
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
    }));

  const contact = compact({
    email: update.contact.email,
    phone: update.contact.phone,
    address: update.contact.address,
    hours: update.contact.hours,
  });

  const content = compact({
    headline: update.headline,
    subheadline: update.subheadline,
    about: update.about,
    ...(services.length > 0 ? { services } : {}),
    ...(products.length > 0 ? { products } : {}),
    ...(Object.keys(contact).length > 0 ? { contact } : {}),
  });

  // Feature strings are matched with the existing keyword detector, so the
  // requirement booleans stay the single source of truth.
  const features =
    update.features.length > 0 ? detectFeatures(update.features.join(", "), current.features) : {};

  const patch: Record<string, unknown> = {};
  if (Object.keys(business).length > 0) patch.business = business;
  if (Object.keys(website).length > 0) patch.website = website;
  if (Object.keys(content).length > 0) patch.content = content;
  if (products.length > 0) patch.ecommerce = { products };
  if (Object.keys(features).length > 0) patch.features = features;

  // Deliberately NOT parsed here: the caller merges this patch with
  // `mergeRequirements` and validates the *merged* result against
  // `RequirementsSchema`. Parsing the partial patch on its own would let nested
  // schema defaults blank out fields the client already provided.
  return patch as Partial<Requirements>;
}

/** Sentences that let the existing correction pass remove dropped offerings. */
export function removalSentences(removals: string[]): string {
  return removals
    .map((removal) => removal.trim())
    .filter(Boolean)
    .map((removal) => `we no longer sell ${removal}.`)
    .join(" ");
}
