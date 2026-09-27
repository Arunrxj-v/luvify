import type { Requirements } from "./requirements";

/**
 * Deterministic answer interpretation.
 *
 * Providers return structured patches when they can, but clients type whatever
 * they like ("we're open Tue-Sun, cash and card, buzzing on Fridays"). These
 * heuristics convert natural language into requirement fields - used by the mock
 * provider, when applying quick-reply answers and as a fallback for real models.
 */

const COLOR_NAMES: Record<string, string> = {
  black: "#0b0b0f",
  white: "#ffffff",
  cream: "#f7f1e6",
  ivory: "#fbf8f1",
  beige: "#e8ded0",
  sand: "#e5d5b7",
  grey: "#6b7280",
  gray: "#6b7280",
  charcoal: "#26262b",
  navy: "#12204a",
  blue: "#1d4ed8",
  sky: "#38bdf8",
  teal: "#0d9488",
  green: "#16a34a",
  olive: "#556b2f",
  mint: "#6ee7b7",
  emerald: "#059669",
  yellow: "#facc15",
  gold: "#c8a24a",
  amber: "#f59e0b",
  orange: "#ea580c",
  terracotta: "#c2593a",
  red: "#dc2626",
  burgundy: "#6b1f33",
  maroon: "#7f1d1d",
  pink: "#ec4899",
  purple: "#7c3aed",
  indigo: "#4f46e5",
  lavender: "#c4b5fd",
  brown: "#92400e",
  tan: "#d2b48c",
};

export const FEATURE_KEYWORDS: Array<{ key: keyof Requirements["features"]; keywords: string[] }> = [
  { key: "contactForm", keywords: ["contact form", "enquiry form", "inquiry form", "get in touch form", "form on the site"] },
  { key: "booking", keywords: ["booking", "reservation", "reserve", "appointments", "appointment", "book a table", "calendar"] },
  { key: "newsletter", keywords: ["newsletter", "mailing list", "email list", "subscribe", "subscribers"] },
  { key: "authentication", keywords: ["login", "sign in", "sign up", "members area", "authentication", "customer portal"] },
  { key: "payments", keywords: ["payments", "payment", "pay online", "checkout", "stripe", "paypal", "credit card"] },
  { key: "blog", keywords: ["blog", "articles", "news section", "insights", "journal"] },
  { key: "ecommerce", keywords: ["ecommerce", "e-commerce", "shop", "store", "sell online", "online store", "cart", "basket"] },
  { key: "search", keywords: ["search", "search bar", "filter products"] },
  { key: "reviews", keywords: ["reviews", "ratings", "testimonials", "social proof"] },
  { key: "delivery", keywords: ["delivery", "deliver", "shipping", "takeaway", "take-away"] },
  { key: "multiLanguage", keywords: ["multiple languages", "bilingual", "translation", "localisation", "localization"] },
  { key: "liveChat", keywords: ["live chat", "chat widget", "instant chat"] },
];

export const PAGE_KEYWORDS: Array<{ name: string; path: string; keywords: string[] }> = [
  { name: "Home", path: "/", keywords: ["homepage", "home page", "landing page"] },
  { name: "About", path: "/about", keywords: ["about", "our story", "who we are"] },
  { name: "Services", path: "/services", keywords: ["services", "what we do", "treatments", "offerings"] },
  { name: "Menu", path: "/menu", keywords: ["menu", "dishes", "drinks list"] },
  { name: "Shop", path: "/shop", keywords: ["shop page", "store page", "catalogue", "catalog", "products page"] },
  { name: "Portfolio", path: "/work", keywords: ["portfolio", "case studies", "our work"] },
  { name: "Gallery", path: "/gallery", keywords: ["gallery", "photo gallery", "album"] },
  { name: "Pricing", path: "/pricing", keywords: ["pricing", "plans", "packages", "rates", "tariffs"] },
  { name: "Blog", path: "/blog", keywords: ["blog", "articles", "news page", "insights"] },
  { name: "Booking", path: "/booking", keywords: ["booking page", "reservations page", "book online"] },
  { name: "Team", path: "/team", keywords: ["team page", "meet the team", "our people", "staff"] },
  { name: "FAQ", path: "/faq", keywords: ["faq", "frequently asked questions"] },
  { name: "Contact", path: "/contact", keywords: ["contact", "get in touch", "enquiries", "enquiry", "find us"] },
  { name: "Shipping", path: "/shipping", keywords: ["shipping policy", "delivery info", "returns", "refunds"] },
  { name: "Terms", path: "/terms", keywords: ["terms", "privacy policy", "legal pages"] },
];

export function findColor(text: string): string | undefined {
  const hex = text.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
  if (hex) return hex[0].toLowerCase();
  const lower = text.toLowerCase();
  for (const name of Object.keys(COLOR_NAMES).sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`\\b${name}\\b`);
    if (pattern.test(lower)) return COLOR_NAMES[name];
  }
  return undefined;
}

const AFFIRMATIVE =
  /\b(yes|yeah|yep|sure|definitely|absolutely|we do|please do|correct|that's right|sounds good|okay|ok|add it|include it|would like)\b/i;
const NEGATIVE = /\b(no|nope|not really|none|we don't|we do not|skip|not needed|no thanks|without)\b/i;

export function parseBooleanAnswer(text: string): boolean | undefined {
  if (AFFIRMATIVE.test(text)) return true;
  if (NEGATIVE.test(text)) return false;
  return undefined;
}

export function splitList(text: string): string[] {
  return text
    .split(/[,;•\n]|\s+\+\s+|\s+and\s+|\s*\/\s*/i)
    .map((part) => part.replace(/^[-*\s]+/, "").trim())
    .filter((part) => part.length > 1 && part.length < 90);
}

export function detectPages(text: string): string[] {
  const lower = text.toLowerCase();
  return Array.from(
    new Set(
      PAGE_KEYWORDS.filter((entry) => entry.keywords.some((keyword) => lower.includes(keyword))).map((entry) => entry.name),
    ),
  );
}

/**
 * Offering vocabulary: phrases that name what the business sells or does
 * ("wedding cakes", "doctor appointments", "payroll automation"). These come
 * from the client's own words - never invented - and ground the product
 * summary, the services list and the generated copy.
 */
const OFFERING_PATTERNS: Array<{ pattern: RegExp; minWords: number }> = [
  // "we make custom wedding cakes and birthday cakes"
  {
    pattern:
      /\b(?:we\s+(?:also\s+|now\s+|currently\s+)?(?:make|offer|provide|sell|serve|do|speciali[sz]e in|focus on)|specializing in|specialising in)\s+([^.!?;]{3,120})/i,
    minWords: 1,
  },
  // "custom wedding cakes, birthday cakes and dessert catering" after a trigger
  { pattern: /\b(?:including|such as|like)\s+([^.!?;]{3,120})/i, minWords: 1 },
  // "need a website for a custom cake studio" - a whole noun phrase, not the
  // business itself ("website for my bakery" names the business, not offerings).
  { pattern: /\bwebsite for\s+(?:a|an)\s+([^.!?;]{3,120})/i, minWords: 2 },
];

/** Splits an offering clause into short phrases, capping noise. */
function splitOfferings(clause: string): string[] {
  return clause
    .split(/[,;•\n]|\s+and\s+also\s+|\s+as well as\s+/i)
    .flatMap((part) => part.split(/\s+and\s+(?=[a-z])/i))
    .map((part) =>
      part
        .replace(/^(?:we|i|they|our|my|the)\s+/i, "")
        .replace(/^(?:make|makes|offer|offers|provide|provides|sell|sells|serve|serves|do|does)\s+/i, "")
        .trim()
        .replace(/[.]+$/, ""),
    )
    .filter((part) => part.length > 2 && part.length < 80 && !/^(website|site|page|pages)$/i.test(part));
}

/**
 * Extracts offering phrases from a free-form client message. Returns [] when
 * the message states no offering - callers merge with what is already known.
 */
export function detectOfferings(text: string): string[] {
  const found: string[] = [];
  for (const { pattern, minWords } of OFFERING_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const clause = match[1].trim();
    if (clause.split(/\s+/).filter(Boolean).length < minWords) continue;
    for (const offering of splitOfferings(clause)) {
      if (!found.some((entry) => entry.toLowerCase() === offering.toLowerCase())) found.push(offering);
    }
  }
  return found.slice(0, 8);
}

/**
 * Head noun of a business description ("A bakery that specialises in..." ->
 * "bakery"), used to phrase the summary the way a person would.
 */
function businessNoun(description: string): string | null {
  const match = description.match(
    /^\s*(?:a|an)\s+([a-z][a-z\s-]{2,36}?)\s*(?:that|which|who|speciali[sz]ing|speciali[sz]es|selling|serving|offering|providing|making|delivering|for|in|,|\.|$)/i,
  );
  const noun = match?.[1]?.trim().toLowerCase();
  if (!noun) return null;
  if (noun.split(/\s+/).length > 4) return null;
  if (/^(business|company|website|site|service|services)$/.test(noun)) return null;
  return noun;
}

/**
 * Derives the Product/Business Summary from the business name plus everything
 * the client has said about what they do: offerings first, then the plain
 * description as a fallback. Never emits generic marketing copy - an empty
 * string when nothing concrete is known yet.
 *
 * When a previous summary exists it is preserved verbatim unless the new
 * message adds offerings or facts the summary does not mention yet; in that
 * case the summary grows by appending the new information, never by
 * rewording or dropping what was there.
 */
export function deriveProductSummary(input: {
  businessName?: string;
  offerings: string[];
  description?: string;
  previous?: string;
}): string {
  const name = (input.businessName ?? "").trim();
  const description = (input.description ?? "").trim().replace(/[.]+$/, "");
  const offerings = input.offerings.map((offering) => offering.trim()).filter(Boolean);
  const previous = (input.previous ?? "").trim();

  const novel = (candidate: string) =>
    candidate.length > 0 &&
    (previous.length === 0 || !previous.toLowerCase().includes(candidate.toLowerCase().slice(0, Math.min(24, candidate.length))));

  const fresh = offerings.filter(novel);
  if (previous && fresh.length === 0) return previous;

  const joinOfferings = (items: string[]): string => {
    if (items.length === 1) return items[0]!;
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  };

  const noun = description ? businessNoun(description) : null;
  const subject = noun ? `A ${noun}` : name || "The business";
  if (offerings.length > 0) {
    const statement = `${subject} specializing in ${joinOfferings(offerings)}.`;
    if (!previous) return statement;
    // Grow the stored summary with what is new; keep the old wording intact.
    const extra = fresh.length > 0 ? ` Also offering ${joinOfferings(fresh)}.` : "";
    return `${previous.replace(/[.]+$/, ".")}${extra}`;
  }

  if (description && novel(description)) {
    if (!previous) return `${subject} - ${description}.`;
    return `${previous.replace(/[.]+$/, ".")} ${description}.`;
  }
  return previous;
}

/** Detects feature intent, honouring negation ("no online payments"). */
export function detectFeatures(text: string, current: Requirements["features"]): Requirements["features"] {
  const lower = text.toLowerCase();
  const next = { ...current };
  // A geographic scope ("we don't deliver outside India") constrains the
  // service area - it must not read as rejecting delivery altogether.
  const hasGeoScope = /\b(outside|except|only in|only within|within india|across india)\b/i.test(text);
  for (const { key, keywords } of FEATURE_KEYWORDS) {
    for (const keyword of keywords) {
      const index = lower.indexOf(keyword);
      if (index === -1) continue;
      const preceding = lower.slice(Math.max(0, index - 45), index);
      if (key === "delivery" && hasGeoScope) {
        next[key] = true;
        break;
      }
      next[key] = !/\b(no|not|don't|do not|without|skip|remove)\b[^.!?]{0,40}$/.test(preceding);
      break;
    }
  }
  next.reviewed = true;
  return next;
}

export function extractEmail(text: string): string | undefined {
  return text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
}

export function extractPhone(text: string): string | undefined {
  return text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim();
}

export function extractDomain(text: string): string | undefined {
  const match = text.match(
    /\b([a-z0-9-]+\.(?:com|co|io|net|org|in|dev|app|shop|store|studio|agency|uk|us|de|fr|au|ca|nz|ai))(\.\w{2})?\b/i,
  );
  return match?.[0];
}

export function extractMoney(text: string): string | undefined {
  return text.match(/(?:[$€£₹]\s?\d[\d,.]*|\brs\.?\s?\d[\d,.]*|\binr\s?\d[\d,.]*|\d[\d,.]*\s?(?:usd|eur|gbp|inr|dollars|euros|pounds|rupees))/i)?.[0];
}

export function hasAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

/** "We're based in Kochi" -> "Kochi". */
export function extractLocation(text: string): string | undefined {
  const match = text.match(
    /\b(?:based in|located in|location (?:is )?in|we'?re in|our (?:shop|store|studio|office|restaurant|cafe|kitchen|salon|clinic) (?:is )?in)\s+([^.!?;]{2,60})/i,
  );
  return match?.[1]?.trim().replace(/[.]+$/, "");
}

/** "Our address is 12 Main St" / "find us at ..." -> the address. */
export function extractAddress(text: string): string | undefined {
  const match = text.match(
    /\b(?:our address is|address is|find us at|visit us at|we'?re at|located at)\s+([^.!?;]{4,120})/i,
  );
  return match?.[1]?.trim().replace(/[.]+$/, "");
}

function wordsOf(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9₹$€£\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function stemVariants(word: string): string[] {
  const variants = new Set([word]);
  if (word.endsWith("ies") && word.length > 4) {
    variants.add(word.slice(0, -3) + "y");
    variants.add(word.slice(0, -1));
  } else if (word.endsWith("s") && word.length > 3 && !word.endsWith("ss")) {
    variants.add(word.slice(0, -1));
  }
  return [...variants];
}

/**
 * Attaches a stated price to the matching product/service/offering
 * ("Our hoodies start at ₹1,499" updates the hoodie entry). Returns the
 * matched entry names so callers can record the fact.
 */
export function attachPrice(
  text: string,
  entries: Array<{ name: string; price?: string }>,
): string[] {
  const money = extractMoney(text);
  if (!money) return [];
  const haystack = new Set(wordsOf(text).flatMap(stemVariants));
  const matched: string[] = [];
  for (const entry of entries) {
    const nameWords = wordsOf(entry.name);
    if (nameWords.length === 0) continue;
    const overlap = nameWords.filter((word) => stemVariants(word).some((variant) => haystack.has(variant)));
    const threshold = nameWords.length <= 2 ? 1 : 2;
    if (overlap.length >= threshold && !(entry.price ?? "").trim()) {
      entry.price = money.trim().replace(/[.]+$/, "");
      matched.push(entry.name);
    }
  }
  return matched;
}

/** Sentences about delivery/shipping/returns - policy facts for the knowledge base. */
export function extractPolicySentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(
      (sentence) =>
        sentence.length > 8 &&
        /\b(deliver|delivery|shipping|ship|returns?|refunds?|pickup|takeaway|outside|regions?|serve|serving)\b/i.test(sentence),
    )
    .map((sentence) => sentence.replace(/[.]+$/, "").trim())
    .slice(0, 3);
}

/** Regions named in a delivery sentence ("delivery only in India"). */
export function extractRegions(text: string): string[] {
  const regions: string[] = [];
  const patterns = [
    /\b(?:only|just)\s+(?:in|within|across)\s+([A-Z][^.!?;,]{1,40})/,
    /\b(?:in|within|across)\s+([A-Z][A-Za-z\s]{1,40}?)(?:\s+only)?$/i,
    /\boutside\s+([A-Z][^.!?;,]{1,40})/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const region = match[1].trim().replace(/[.]+$/, "");
      if (region.length > 1 && region.length < 50) regions.push(region);
    }
  }
  return [...new Set(regions)];
}

/** "instagram.com/acme" or "find us on instagram at ..." -> { network: url }. */
export function extractSocials(text: string): Record<string, string> {
  const socials: Record<string, string> = {};
  const networks = ["instagram", "facebook", "x", "linkedin", "tiktok", "youtube"];
  const lower = text.toLowerCase();
  for (const network of networks) {
    if (!lower.includes(network)) continue;
    const urlPattern =
      network === "x"
        ? /\b((?:x\.com|twitter\.com)\/[A-Za-z0-9_./-]+)/i
        : new RegExp(`\\b((?:${network}\\.com)\\/[A-Za-z0-9_.\\/-]+)`, "i");
    const urlMatch = text.match(urlPattern);
    if (urlMatch?.[1]) {
      socials[network] = urlMatch[1].startsWith("http") ? urlMatch[1] : `https://${urlMatch[1]}`;
      continue;
    }
    const handleMatch = text.match(new RegExp(`${network}\\s+(?:at|as|:)\\s*(@?[A-Za-z0-9_.]+)`, "i"));
    if (handleMatch?.[1]) socials[network] = handleMatch[1];
  }
  return socials;
}

export const HOURS_PATTERN = /\b(mon|tue|wed|thu|fri|sat|sun|daily|weekdays|weekends)[a-z]*\b[^.!?]{0,40}/i;

/** Reads a free-form message and produces requirement updates for what it recognises. */
export function extractRequirementsFromText(text: string, current: Requirements): Partial<Requirements> {
  const patch: Record<string, unknown> = {};
  const lower = text.toLowerCase();

  const pages = detectPages(text);
  if (pages.length > 0) setPath(patch, "website.requiredPages", pages);

  const features = detectFeatures(text, current.features);
  if (pages.length > 0 || features.reviewed) setPath(patch, "features", features);

  // Offerings + product summary: the client telling us what they sell or do
  // ("we make custom wedding cakes", "we also provide dessert catering").
  // Merged with what is already known and folded into the maintained summary.
  const offerings = detectOfferings(text);
  const knownOfferings = [...(current.business.offerings ?? [])];
  for (const offering of offerings) {
    if (!knownOfferings.some((entry) => entry.toLowerCase() === offering.toLowerCase())) knownOfferings.push(offering);
  }
  if (offerings.length > 0) setPath(patch, "business.offerings", knownOfferings);
  if (offerings.length > 0 || (current.business.description && !current.business.productSummary)) {
    const summary = deriveProductSummary({
      businessName: current.business.name,
      offerings: knownOfferings,
      description: current.business.description,
      previous: current.business.productSummary,
    });
    if (summary && summary !== current.business.productSummary) setPath(patch, "business.productSummary", summary);
  }

  const color = findColor(text);
  if (color && /\b(colour|color|brand|palette|theme)\b/.test(lower)) setPath(patch, "branding.primaryColor", color);
  const email = extractEmail(text);
  if (email) setPath(patch, "content.contact.email", email);
  const phone = extractPhone(text);
  if (phone && /\b(phone|call|tel|mobile|number)\b/.test(lower)) setPath(patch, "content.contact.phone", phone);
  // Chat improves the knowledge base: locations, addresses, prices, delivery
  // areas and policies stated in conversation become verified facts.
  const location = extractLocation(text);
  if (location) setPath(patch, "business.location", location);
  const address = extractAddress(text);
  if (address) setPath(patch, "content.contact.address", address);
  // A stated price belongs to the matching product/service ("hoodies start at
  // ₹1,499"), never to a generic price field.
  const pricedProducts = [...(current.content.products ?? []), ...(current.ecommerce.products ?? [])].map((entry) => ({ ...entry }));
  const pricedServices = [...(current.content.services ?? [])].map((entry) => ({ ...entry }));
  const matchedProducts = attachPrice(text, pricedProducts);
  const matchedServices = attachPrice(text, pricedServices);
  if (matchedProducts.length > 0 || matchedServices.length > 0) {
    if (matchedProducts.length > 0) {
      const ecommerceNames = new Set(current.ecommerce.products.map((entry) => entry.name));
      setPath(
        patch,
        "content.products",
        pricedProducts.filter((entry) => !ecommerceNames.has(entry.name)),
      );
      setPath(
        patch,
        "ecommerce.products",
        pricedProducts.filter((entry) => ecommerceNames.has(entry.name)),
      );
    }
    if (matchedServices.length > 0) setPath(patch, "content.services", pricedServices);
  }
  // Delivery areas and policy sentences ("we don't deliver outside India").
  const policySentences = extractPolicySentences(text);
  const regions = extractRegions(text);
  if (policySentences.length > 0 || regions.length > 0) {
    const existingNotes = current.ecommerce.shipping.notes?.trim() ?? "";
    const notes = [...(existingNotes ? [existingNotes] : []), ...policySentences]
      .filter((entry, index, all) => entry && all.indexOf(entry) === index)
      .join(" | ")
      .slice(0, 500);
    const mergedRegions = [...current.ecommerce.shipping.regions];
    for (const region of regions) {
      if (!mergedRegions.some((entry) => entry.toLowerCase() === region.toLowerCase())) mergedRegions.push(region);
    }
    setPath(patch, "ecommerce.shipping", { notes, regions: mergedRegions });
  }
  const socials = extractSocials(text);
  if (Object.keys(socials).length > 0) {
    setPath(patch, "content.socials", { ...current.content.socials, ...socials });
  }
  const domain = extractDomain(text);
  if (domain && /\b(domain|\.com|website address|url)\b/.test(lower)) setPath(patch, "technical.domain", domain);
  const hoursMatch = text.match(HOURS_PATTERN);
  if (hoursMatch) setPath(patch, "content.contact.hours", hoursMatch[0].trim());
  if (/\b(established|since|founded)\b/i.test(text)) {
    setPath(patch, "business.uniqueSellingPoints", [text.trim().slice(0, 120)]);
  }
  return patch as Partial<Requirements>;
}

/** Immutably sets `a.b.c` on the given object. */
export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".").filter(Boolean);
  let cursor: Record<string, unknown> = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index]!;
    const next = cursor[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  if (!last) return;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const existing = cursor[last];
    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
      cursor[last] = { ...(existing as Record<string, unknown>), ...(value as Record<string, unknown>) };
      return;
    }
  }
  cursor[last] = value;
}

export interface AnswerInput {
  questionId?: string;
  mapsTo?: string;
  text: string;
  optionLabels?: string[];
}

/**
 * Applies a quick-reply answer (or free text) to the requirements tree: the
 * question's declared `mapsTo` path wins, otherwise id heuristics apply, and
 * anything else recognised in the text is merged in as a bonus.
 */
export function applyAnswer(current: Requirements, answer: AnswerInput): Partial<Requirements> {
  const text = answer.text.trim();
  const raw = answer.optionLabels?.length ? answer.optionLabels.join(", ") : text;
  const patch: Record<string, unknown> = {};
  const set = (path: string, value: unknown) => setPath(patch, path, value);
  const boolean = parseBooleanAnswer(raw);
  const id = (answer.questionId ?? "").toLowerCase();
  const target = answer.mapsTo ?? "";

  if (id === "confirmation" || id === "approve-generation") {
    return patch as Partial<Requirements>;
  }

  if (id.startsWith("business-name") || target === "business.name") set("business.name", text);
  else if (id.startsWith("business-description") || target === "business.description") set("business.description", text);
  else if (id.startsWith("business-industry") || target === "business.industry") set("business.industry", text);
  else if (id.startsWith("target-audience") || target === "business.targetAudience") set("business.targetAudience", text);
  else if (id.startsWith("location") || target === "business.location") set("business.location", text);
  else if (id.startsWith("usp") || target === "business.uniqueSellingPoints") set("business.uniqueSellingPoints", splitList(raw));
  else if (id.startsWith("primary-goal") || target === "website.primaryGoal") set("website.primaryGoal", text);
  else if (id.startsWith("conversion") || target === "website.conversionAction") set("website.conversionAction", text);
  else if (id.startsWith("purpose") || target === "website.purpose") set("website.purpose", text);
  else if (id.startsWith("tone") || target === "website.toneOfVoice") set("website.toneOfVoice", text);
  else if (id.startsWith("required-pages") || target === "website.requiredPages") set("website.requiredPages", splitList(raw));
  else if (id.startsWith("brand-name") || target === "branding.brandName") set("branding.brandName", text);
  else if (id.startsWith("logo") || target === "branding.logo" || target === "branding.existingAssets")
    set("branding.existingAssets", text);
  else if (id.startsWith("primary-color") || target === "branding.primaryColor") set("branding.primaryColor", findColor(raw) ?? raw);
  else if (id.startsWith("secondary-color") || target === "branding.secondaryColor")
    set("branding.secondaryColor", findColor(raw) ?? raw);
  else if (id.startsWith("accent-color") || target === "branding.accentColor") set("branding.accentColor", findColor(raw) ?? raw);
  else if (id.startsWith("style") || target === "branding.style") set("branding.style", text);
  else if (id.startsWith("fonts") || target === "branding.fontPreference") set("branding.fontPreference", text);
  else if (id.startsWith("headline") || target === "content.headline") set("content.headline", text);
  else if (id.startsWith("about") || target === "content.about") set("content.about", text);
  else if (id.startsWith("services") || target === "content.services") {
    set("content.services", splitList(raw).map((name) => ({ name, description: "", price: extractMoney(raw) ?? "" })));
  } else if (id.startsWith("products") || target === "content.products" || target === "ecommerce.products") {
    const items = splitList(raw).map((name) => ({ name, description: "", price: extractMoney(raw) ?? "", category: "" }));
    set(target.startsWith("ecommerce") ? "ecommerce.products" : "content.products", items);
  } else if (id.startsWith("testimonials") || target === "content.testimonials") {
    set("content.testimonials", splitList(raw).map((quote) => ({ quote, author: "", role: "" })));
  } else if (id.startsWith("faq") || target === "content.faq") {
    set("content.faq", splitList(raw).map((question) => ({ question, answer: "" })));
  } else if (id.startsWith("contact-details") || target === "content.contact") {
    set("content.contact", { email: extractEmail(raw) ?? "", phone: extractPhone(raw) ?? "", address: text });
  } else if (id.startsWith("hours") || target === "content.contact.hours") set("content.contact.hours", text);
  else if (id.startsWith("address") || target === "content.contact.address") set("content.contact.address", text);
  else if (id.startsWith("email") || target === "content.contact.email") set("content.contact.email", extractEmail(text) ?? text);
  else if (id.startsWith("phone") || target === "content.contact.phone") set("content.contact.phone", extractPhone(text) ?? text);
  else if (id.startsWith("social") || target === "content.socials") {
    set("content.socials", { instagram: extractDomain(raw) ?? "", facebook: "", x: "", linkedin: "", tiktok: "", youtube: "" });
  } else if (id.startsWith("currency") || target === "ecommerce.currency") set("ecommerce.currency", text.toUpperCase().slice(0, 3));
  else if (id.startsWith("payment") || target === "ecommerce.paymentProvider") set("ecommerce.paymentProvider", text);
  else if (id.startsWith("shipping") || target === "ecommerce.shipping") set("ecommerce.shipping", { notes: text });
  else if (id.startsWith("catalog") || target === "ecommerce.catalogSize") set("ecommerce.catalogSize", text);
  else if (id.startsWith("variants") || target === "ecommerce.variants") set("ecommerce.variants", text);
  else if (id.startsWith("domain") || target === "technical.domain") set("technical.domain", extractDomain(text) ?? text);
  else if (id.startsWith("analytics") || target === "technical.analytics.provider") set("technical.analytics.provider", text);
  else if (id.startsWith("seo-description") || target === "technical.seo.defaultDescription")
    set("technical.seo.defaultDescription", text);
  else if (id.startsWith("seo-keywords") || target === "technical.seo.keywords") set("technical.seo.keywords", splitList(raw));
  else if (id.startsWith("feature") || target === "features") set("features", resolveFeatureAnswer(current, raw, answer.optionLabels));
  else if (id.startsWith("feature-") && boolean !== undefined) {
    const key = id.replace("feature-", "");
    const match = Object.keys(current.features).find((candidate) => candidate.toLowerCase() === key);
    if (match) set("features", { ...current.features, [match]: boolean, reviewed: true });
  }
  return mergePatch(patch, extractRequirementsFromText(text, current));
}

function resolveFeatureAnswer(current: Requirements, raw: string, optionLabels: string[] | undefined): Requirements["features"] {
  const features = detectFeatures(raw, current.features);
  const selected = (optionLabels?.length ? optionLabels.join(" ") : raw).toLowerCase();
  for (const { key, keywords } of FEATURE_KEYWORDS) {
    if (keywords.some((keyword) => selected.includes(keyword))) features[key] = true;
  }
  if (/\bnone\b|\bno features\b|\bnothing\b/.test(selected)) {
    for (const { key } of FEATURE_KEYWORDS) features[key] = false;
  }
  features.reviewed = true;
  return features;
}

/** Shallow merge with one nested level; explicit patches win over extracted values. */
function mergePatch(patch: Record<string, unknown>, extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...extra };
  for (const [key, value] of Object.entries(patch)) {
    const existing = out[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      out[key] = { ...(existing as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      out[key] = value;
    }
  }
  return out;
}

const CHANGE_VERB = /\b(change|update|make|redesign|restyle|adjust|switch|swap|replace|rewrite|revamp|rework|redo|tweak)\b/i;
const CHANGE_TARGET =
  /\b(design|styles?|colou?rs?|themes?|layouts?|typography|fonts?|headlines?|copy|wording|images?|logos?|menus?|navigation|footers?|headers?|buttons?|cta|sections?|pages?|darker|lighter|darker-looking|brighter|bolder|minimal(ist)?)\b/i;

/**
 * Detects a *site change request* ("change the About page to use a darker
 * design") as opposed to a plain fact ("we're open Tue-Fri"). Structured
 * extraction handles facts; these requests are queued on
 * `website.changeRequests` so they stay attached to the project and reach the
 * next specification build / modify pass.
 *
 * Returns the (trimmed, capped) request text, or `undefined` when the message
 * is not a change request.
 */
export function detectChangeRequest(text: string): string | undefined {
  const message = text.trim();
  if (message.length === 0) return undefined;
  if (!CHANGE_VERB.test(message)) return undefined;
  if (!CHANGE_TARGET.test(message)) return undefined;
  return message.slice(0, 300);
}



