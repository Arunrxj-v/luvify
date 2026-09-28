/**
 * Prompt construction for every AI step.
 *
 * Two invariants hold for all prompts here:
 *
 * 1. PROJECT ISOLATION - each prompt is built from exactly one project's
 *    knowledge/architecture. Nothing is read from module-level state, and no
 *    other project's content can reach it, which is what prevents the
 *    cross-project bleed this pipeline previously suffered from.
 * 2. NO FABRICATED FACTS - the model is given the verified facts *and* the
 *    explicit list of unknowns it must not invent, and is told to emit
 *    actionable placeholders instead of made-up details.
 */

import type { ProjectKnowledge } from "@luvify/shared";
import { summarizeKnowledge } from "@luvify/shared";

/** The non-negotiable grounding rules attached to every generation prompt. */
export const GROUNDING_RULES = [
  "You are writing for ONE specific business described below. Never write content for any other business, industry or product category.",
  "Use ONLY the verified facts provided. Never invent or guess: phone numbers, addresses, emails, prices, statistics, awards, certifications, years of experience, customer or patient counts, testimonials, reviews, employee or doctor names, founder names, locations, opening hours, qualifications, guarantees, shipping or return policies, or company history.",
  "When a detail is listed as UNKNOWN or appears in the content gaps, do NOT invent it. Write around it, or use a clearly editable placeholder such as \"Add your clinic's contact number\" instead of a fabricated value.",
  "Never output a specific number, currency amount, percentage or date unless it appears in the verified facts.",
  "Write concrete, useful marketing copy grounded in the offering described - being specific about what the client does is good; inventing facts is not.",
  "Match the page's stated purpose. Do not add navigation, sections or content types the page was not given.",
].join("\n");

/** The project context block shared by generation prompts (one project only). */
export function projectBlock(context: {
  siteName: string;
  websiteType: string;
  knowledge: ProjectKnowledge;
}): string {
  const { knowledge } = context;
  const lines: string[] = [
    `PROJECT (id: ${knowledge.projectId || "unset"})`,
    `Business name: ${knowledge.businessName || context.siteName}`,
    `Requested website type: ${context.websiteType || knowledge.websiteType || "unspecified"}`,
    "",
    "--- VERIFIED PROJECT KNOWLEDGE (the only permitted source of facts) ---",
    summarizeKnowledge(knowledge),
  ];
  if (knowledge.knownFacts.length > 0) {
    lines.push("", "Verified facts:");
    for (const fact of knowledge.knownFacts.slice(0, 40)) lines.push(`  - ${fact}`);
  }
  lines.push(
    "",
    "--- UNKNOWNS (must never be invented) ---",
    knowledge.unknowns.length > 0 ? knowledge.unknowns.join("; ") : "none recorded",
  );
  return lines.join("\n");
}

export interface PromptPair {
  system: string;
  user: string;
}

/** The JSON skeleton shown to the model for the architecture step. */
const ARCHITECTURE_SKELETON = {
  archetype: "healthcare",
  websiteType: "business",
  businessSummary: "one sentence describing what this business actually does",
  coreProblem: "the problem it solves for its audience",
  valueProposition: "why its customers choose it",
  targetAudience: "who it serves",
  features: ["online appointment booking"],
  pages: [
    {
      name: "Home",
      path: "/",
      purpose: "why this page exists for this business",
      contentRequirements: ["what information this page needs"],
    },
  ],
  userJourneys: [{ goal: "book an appointment", steps: ["land on home", "open booking"] }],
};

export function architecturePrompt(context: {
  siteName: string;
  websiteType: string;
  knowledge: ProjectKnowledge;
  features: string[];
  requiredPages: string[];
  primaryGoal: string;
  conversionAction: string;
}): PromptPair {
  const system = [
    "You are Luvify's website architect. You decide the structure of a website from a client's requirements.",
    GROUNDING_RULES,
    [
      "Derive the page set from THIS business's actual services and goals - never from a universal template.",
      "Correct domain-specific examples: hospital/clinic -> Home, Doctors or Departments, Book Appointment, Services, About, Contact; e-commerce -> Home, Shop, Product, Cart, Checkout; restaurant -> Home, Menu, Reservations, Location; SaaS -> Home, Features, Pricing, Docs; portfolio -> Home, Work, About, Contact.",
      "Do NOT propose Shop, Cart, Checkout, Wishlist or Pricing unless the client sells products or charges money. Do NOT propose Doctors, Departments or Appointments unless the business provides them.",
    ].join("\n"),
  ].join("\n\n");

  const user = [
    projectBlock(context),
    "",
    "--- CLIENT REQUIREMENTS ---",
    `Primary goal: ${context.primaryGoal || "not stated"}`,
    `Main conversion action: ${context.conversionAction || "not stated"}`,
    `Features the client asked for: ${
      context.features.length > 0 ? context.features.join(", ") : "none stated"
    }`,
    `Pages the client asked for: ${
      context.requiredPages.length > 0
        ? context.requiredPages.join(", ")
        : "not stated - derive them from the business"
    }`,
    "",
    "--- TASK ---",
    "Return this business's website architecture as a single JSON object with exactly this shape:",
    JSON.stringify(ARCHITECTURE_SKELETON, null, 2),
    "",
    "Requirements:",
    '- `archetype` is the domain, lowercase (e.g. "healthcare", "ecommerce", "restaurant", "saas", "portfolio", "business").',
    '- `path` starts with "/" and the home page path is exactly "/".',
    "- Every page needs a `purpose` naming what it does for THIS business.",
    "- `contentRequirements` lists the specific information that page needs.",
    "- Include only pages this business genuinely needs.",
  ].join("\n");

  return { system, user };
}

export function requirementExtractionPrompt(
  context: { siteName: string; websiteType: string; knowledge: ProjectKnowledge },
  message: string,
  history: Array<{ role: string; content: string }>,
): PromptPair {
  const system = [
    "You maintain the structured project knowledge for one Luvify project.",
    "Extract ONLY information the client actually stated. Never infer, complete or invent facts they did not give you.",
    "Leave any field you have no stated information for as an empty string or empty array.",
  ].join("\n");

  const transcript = history
    .slice(-12)
    .map((entry) => `${entry.role === "user" ? "CLIENT" : "ASSISTANT"}: ${entry.content}`)
    .join("\n");

  const user = [
    projectBlock(context),
    "",
    "--- RECENT TRANSCRIPT (this project only) ---",
    transcript || "(no earlier messages)",
    "",
    "--- CLIENT'S NEWEST MESSAGE ---",
    message,
    "",
    "--- TASK ---",
    "Return a single JSON object with exactly this shape:",
    JSON.stringify(
      {
        businessSummary: "what the business is, in the client's own terms (empty if not stated)",
        valueProposition: "",
        targetAudience: "",
        coreProblem: "",
        industry: "",
        offerings: ["exact client concepts, e.g. 'oversized T-shirts'"],
        features: ["functionality the client asked for, e.g. 'online booking'"],
        requiredPages: ["pages the client explicitly asked for"],
        primaryGoal: "",
        conversionAction: "",
        toneOfVoice: "",
        headline: "",
        subheadline: "",
        about: "",
        services: [{ name: "", description: "", price: "" }],
        products: [{ name: "", description: "", price: "", category: "" }],
        contact: { email: "", phone: "", address: "", hours: "" },
        removals: ["things the client said they no longer offer"],
      },
      null,
      2,
    ),
    "",
    "Rules:",
    "- Only fill fields the newest message (or an unambiguous earlier client statement) supports.",
    "- Put anything the client says they no longer offer in `removals`.",
    "- Never invent contact details, prices, names or statistics.",
  ].join("\n");

  return { system, user };
}

/** Skeleton for the page copy step; keys match the renderer's section props. */
const PAGE_COPY_SKELETON = {
  title: "Page title naming the business",
  description: "Meta description for this page",
  sections: {
    hero: {
      eyebrow: "Short category label, or empty",
      title: "Page headline",
      subtitle: "One or two supporting sentences",
      primaryCtaLabel: "Label for the main button",
      trustLine: "Short trust line, or empty",
    },
    about: { eyebrow: "", title: "", body: ["paragraph"], highlights: ["short highlight"] },
    features: { eyebrow: "", title: "", subtitle: "", items: [{ title: "", description: "" }] },
    services: {
      eyebrow: "",
      title: "",
      subtitle: "",
      items: [{ title: "", description: "", price: "", duration: "", bulletPoints: [] }],
    },
    faq: { eyebrow: "", title: "", subtitle: "", items: [{ question: "", answer: "" }] },
    cta: { eyebrow: "", title: "", body: "", buttonLabel: "" },
    contact: { eyebrow: "", title: "", subtitle: "" },
    gallery: { eyebrow: "", title: "", subtitle: "" },
    testimonials: { eyebrow: "", title: "", items: [{ quote: "", author: "", role: "" }] },
    team: { eyebrow: "", title: "", subtitle: "", members: [{ name: "", role: "", bio: "" }] },
    blog: { eyebrow: "", title: "", subtitle: "", posts: [{ title: "", excerpt: "", category: "" }] },
  },
};

/**
 * Per-page copy prompt.
 *
 * The model receives the page's own purpose, the architecture it belongs to and
 * the exact section list that page carries, so `/doctors` is written as a
 * doctors page and `/book-appointment` as a booking page - never the same
 * generic prompt for every page.
 */
export function pageCopyPrompt(input: {
  siteName: string;
  websiteType: string;
  knowledge: ProjectKnowledge;
  architecture: {
    archetype: string;
    pages: Array<{ name: string; path: string; purpose: string }>;
  };
  page: {
    name: string;
    path: string;
    purpose: string;
    contentRequirements: string[];
    sectionTypes: string[];
  };
}): PromptPair {
  const system = [
    "You are Luvify's copywriter. You write the content for exactly one page of one website.",
    GROUNDING_RULES,
    "Write real, specific copy for THIS business. Do not pad with generic filler and do not describe features the client never asked for.",
  ].join("\n\n");

  const otherPages = input.architecture.pages
    .filter((page) => page.path !== input.page.path)
    .map((page) => `${page.name} (${page.path}) - ${page.purpose}`)
    .join("\n");

  const user = [
    projectBlock(input),
    "",
    "--- WEBSITE ARCHITECTURE (this project) ---",
    `Archetype: ${input.architecture.archetype}`,
    `Other pages:\n${otherPages || "(none)"}`,
    "",
    "--- THE PAGE YOU ARE WRITING ---",
    `Name: ${input.page.name}`,
    `Path: ${input.page.path}`,
    `Purpose: ${input.page.purpose || "(not stated)"}`,
    `Required content: ${
      input.page.contentRequirements.length > 0
        ? input.page.contentRequirements.join("; ")
        : "(none specified)"
    }`,
    `Sections present on this page (write copy ONLY for these): ${
      input.page.sectionTypes.join(", ") || "none"
    }`,
    "",
    "--- TASK ---",
    "Return a single JSON object shaped like this, including ONLY the section keys listed above:",
    JSON.stringify(PAGE_COPY_SKELETON, null, 2),
    "",
    "Rules:",
    "- `title` and `description` are the page's meta title/description and name the actual business.",
    "- The Hero `title` is a headline that works for THIS page, not a generic slogan.",
    "- `items` must be grounded in the verified knowledge; omit an item list entirely rather than filling it with invented specifics.",
    "- If the page is a contact or booking page, never invent an address, phone number, email or opening hours. Leave those fields empty - the renderer shows an editable placeholder.",
    "- Never mention a different industry, product or business.",
  ].join("\n");

  return { system, user };
}


/**
 * Validation prompt: the model audits generated copy against the approved
 * summary. This is the guard against unrelated content (e-commerce copy on a
 * hospital page) reaching the database.
 */
export function contentValidationPrompt(input: {
  siteName: string;
  websiteType: string;
  knowledge: ProjectKnowledge;
  page: { name: string; path: string; purpose: string };
  copy: unknown;
}): PromptPair {
  const system = [
    "You are Luvify's content auditor. You judge whether generated page copy is safe to publish.",
    "You are strict: a false 'accept' ships misinformation, so report any unsupported fact.",
    "Judge only against the project knowledge given. Do not add content yourself.",
  ].join("\n");

  const user = [
    projectBlock(input),
    "",
    "--- PAGE UNDER REVIEW ---",
    `Name: ${input.page.name}`,
    `Path: ${input.page.path}`,
    `Purpose: ${input.page.purpose || "(not stated)"}`,
    "",
    "--- GENERATED COPY ---",
    JSON.stringify(input.copy, null, 2).slice(0, 8_000),
    "",
    "--- TASK ---",
    "Return a single JSON object with exactly this shape:",
    JSON.stringify(
      {
        relevant: true,
        relevanceScore: 90,
        unsupportedFacts: ["exact sentence asserting a fact the client never provided"],
        unrelatedContent: ["content belonging to a different business or industry"],
        issues: ["any other problem"],
        verdict: "accept",
        reason: "one sentence",
      },
      null,
      2,
    ),
    "",
    "Rules:",
    '- `verdict` is "reject" when the copy belongs to a different business/industry or invents significant facts, "revise" for smaller unsupported claims, "accept" when it is grounded and on-topic.',
    "- Count invented contact details, prices, statistics, credentials, names and policies as unsupported facts.",
    "",
    "Example of the failure you must catch: copy about candles, shipping or a cart would be `unrelatedContent` on a hospital appointment page.",
  ].join("\n");

  return { system, user };
}

/** Non-generation prompt: a grounded conversational reply for the chat step. */
export function chatReplyPrompt(input: {
  siteName: string;
  websiteType: string;
  knowledge: ProjectKnowledge;
  userMessage: string;
  acknowledged: string[];
  nextQuestion: string;
}): PromptPair {
  const system = [
    "You are Luvify's assistant, helping a client describe their business so a website can be built.",
    GROUNDING_RULES,
    "Reply in at most three sentences. Be warm and concrete.",
  ].join("\n");

  const user = [
    projectBlock(input),
    "",
    "--- WHAT JUST CHANGED ---",
    input.acknowledged.length > 0 ? input.acknowledged.join("\n") : "nothing recorded",
    "",
    "--- CLIENT SAID ---",
    input.userMessage,
    "",
    "--- TASK ---",
    "Write the assistant's reply: briefly acknowledge what you understood from the client's message, then ask the following question naturally.",
    input.nextQuestion
      ? `Next question to ask: ${input.nextQuestion}`
      : "The interview is complete - invite them to generate the website.",
    "Return only the reply text, no JSON and no preamble.",
  ].join("\n");

  return { system, user };
}

