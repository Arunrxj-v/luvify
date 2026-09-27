import { COMPLETENESS_LABELS, type CompletenessCategory } from "./enums";
import { enabledFeatures, hasValue, isEcommerceProject, type Requirements } from "./requirements";

/**
 * Requirements completeness engine.
 *
 * Deterministic and dependency-free so the UI can show live progress while the
 * AI is still interviewing, and so the server can decide when a project is ready
 * for generation. Categories that do not apply to a project (e-commerce for a
 * portfolio, for example) are reported as `applicable: false` and excluded from
 * the overall score instead of faking a percentage.
 */

export interface CompletenessCategoryResult {
  key: CompletenessCategory;
  label: string;
  score: number;
  applicable: boolean;
  weight: number;
  missing: string[];
}

export interface CompletenessReport {
  overall: number;
  categories: CompletenessCategoryResult[];
  blocking: string[];
  readyForGeneration: boolean;
  readyMessage: string;
}

const WEIGHTS: Record<CompletenessCategory, number> = {
  business: 0.2,
  branding: 0.12,
  pages: 0.15,
  content: 0.2,
  features: 0.1,
  ecommerce: 0.08,
  technical: 0.05,
  seo: 0.1,
};

const MIN_OVERALL = 70;

interface CategoryInput {
  key: CompletenessCategory;
  checks: Array<[boolean, string]>;
  applicable?: boolean;
  score?: number;
}

function scoreChecks(checks: Array<[boolean, string]>): { score: number; missing: string[] } {
  if (checks.length === 0) return { score: 0, missing: [] };
  const missing = checks.filter(([passed]) => !passed).map(([, label]) => label);
  const passed = checks.length - missing.length;
  return { score: Math.round((passed / checks.length) * 100), missing };
}

export function computeCompleteness(req: Requirements): CompletenessReport {
  const featuresEnabled = enabledFeatures(req);
  const isCommerce = isEcommerceProject(req);

  const inputs: CategoryInput[] = [
    {
      key: "business",
      checks: [
        [hasValue(req.business.name), "Business name"],
        [hasValue(req.business.description, 20), "What the business does (1-2 sentences)"],
        [hasValue(req.business.industry), "Industry"],
        [hasValue(req.business.targetAudience), "Target audience"],
        [
          hasValue(req.business.location) || req.business.uniqueSellingPoints.length > 0,
          "Location or unique selling points",
        ],
      ],
    },
    {
      key: "branding",
      checks: [
        [hasValue(req.branding.brandName) || hasValue(req.business.name), "Brand name"],
        [hasValue(req.branding.primaryColor), "Primary color"],
        [hasValue(req.branding.style), "Design style"],
        [hasValue(req.branding.fontPreference), "Font preference"],
        [hasValue(req.branding.logo) || hasValue(req.branding.existingAssets), "Existing logo / brand assets"],
      ],
    },
    {
      key: "pages",
      checks: [
        [req.website.requiredPages.length > 0, "Required pages"],
        [hasValue(req.website.purpose), "Website purpose"],
        [hasValue(req.website.primaryGoal), "Primary business goal"],
        [hasValue(req.website.conversionAction), "Primary conversion action"],
      ],
    },
    {
      key: "content",
      checks: [
        [hasValue(req.content.headline), "Homepage headline"],
        [hasValue(req.content.subheadline) || hasValue(req.content.about, 40), "About / supporting copy"],
        [req.content.services.length > 0 || req.content.products.length > 0, "Services or key offerings"],
        [
          req.content.testimonials.length > 0 || req.content.faq.length > 1 || req.features.reviews,
          "Social proof (testimonials, reviews or FAQ)",
        ],
        [hasValue(req.content.contact.email) || hasValue(req.content.contact.phone), "Contact details"],
      ],
    },
    {
      key: "features",
      score: req.features.reviewed ? (featuresEnabled.length >= 2 ? 100 : 75) : featuresEnabled.length > 0 ? 40 : 0,
      checks: [
        [req.features.reviewed, "Feature checklist confirmation"],
        [featuresEnabled.length > 0, "At least one feature decision"],
      ],
    },
    {
      key: "ecommerce",
      applicable: isCommerce,
      checks: [
        [hasValue(req.ecommerce.currency), "Currency"],
        [
          req.ecommerce.products.length > 0 || req.content.products.length > 0 || hasValue(req.ecommerce.catalogSize),
          "Product catalog",
        ],
        [hasValue(req.ecommerce.paymentProvider), "Payment provider"],
        [
          hasValue(req.ecommerce.shipping.notes) ||
            hasValue(req.ecommerce.shipping.flatRate) ||
            hasValue(req.ecommerce.shipping.freeShippingThreshold) ||
            req.ecommerce.shipping.regions.length > 0,
          "Shipping rules",
        ],
      ],
    },
    {
      key: "technical",
      checks: [
        [hasValue(req.technical.domain) || hasValue(req.technical.hosting), "Domain or hosting preference"],
        [hasValue(req.technical.analytics.provider), "Analytics decision"],
      ],
    },
    {
      key: "seo",
      checks: [
        [hasValue(req.technical.seo.defaultDescription), "SEO description"],
        [req.technical.seo.keywords.length >= 3, "At least 3 SEO keywords"],
      ],
    },
  ];

  const categories: CompletenessCategoryResult[] = inputs.map((input) => {
    const applicable = input.applicable ?? true;
    const computed = scoreChecks(input.checks);
    return {
      key: input.key,
      label: COMPLETENESS_LABELS[input.key],
      applicable,
      weight: WEIGHTS[input.key],
      score: applicable ? (input.score ?? computed.score) : 0,
      missing: applicable ? computed.missing : [],
    };
  });

  const applicable = categories.filter((c) => c.applicable);
  const totalWeight = applicable.reduce((sum, c) => sum + c.weight, 0);
  const overall = totalWeight
    ? Math.round(applicable.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight)
    : 0;

  const blocking: string[] = [];
  if (!hasValue(req.business.name)) blocking.push("business name");
  if (!hasValue(req.business.description, 20)) blocking.push("what the business does");
  if (req.website.requiredPages.length === 0) blocking.push("required pages");
  if (!hasValue(req.content.headline) && !hasValue(req.content.about, 40)) blocking.push("homepage copy");
  if (isCommerce && !hasValue(req.ecommerce.paymentProvider)) blocking.push("payment provider");

  const byKey = (key: CompletenessCategory): number => categories.find((c) => c.key === key)?.score ?? 0;
  const readyForGeneration =
    blocking.length === 0 &&
    overall >= MIN_OVERALL &&
    byKey("business") >= 80 &&
    byKey("pages") >= 60 &&
    byKey("content") >= 60;

  return {
    overall,
    categories,
    blocking,
    readyForGeneration,
    readyMessage: readyForGeneration
      ? "I have enough information to build the first version of your website."
      : `Still needed: ${blocking.length ? blocking.join(", ") : `a few details to reach ${MIN_OVERALL}% completeness`}.`,
  };
}

/** Compact textual report used by prompts and by the chat completeness card. */
export function formatCompleteness(report: CompletenessReport): string {
  const parts = report.categories.map((c) => `${c.label}: ${c.applicable ? `${c.score}%` : "n/a"}`);
  return `${parts.join(" | ")} => overall ${report.overall}%`;
}
