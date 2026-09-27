/**
 * The mock AI interview: a fixed question bank driven by completeness.
 *
 * Every question declares the `requirements` path it fills (`mapsTo`), so the
 * deterministic interview loop and `applyAnswer()` stay in sync - the same
 * question ids the real AI provider would emit.
 */

import {
  COMPLETENESS_LABELS,
  DESIGN_STYLES,
  PAGE_KEYWORDS,
  type CompletenessReport,
  type CompletenessSnapshot,
  type InterviewQuestion,
  type Requirements,
} from "@luvify/shared";

const rawQuestions: Array<Omit<InterviewQuestion, "help"> & { help?: string }> = [
  {
    id: "business-name",
    question: "What is your business called?",
    help: "The name that should appear in the logo and the footer.",
    type: "text",
    options: [],
    allowOther: true,
    mapsTo: "business.name",
    category: "business",
  },
  {
    id: "business-description",
    question: "What does your business do? One or two sentences is perfect.",
    help: "I use this to write the about copy and the meta description.",
    type: "long-text",
    options: [],
    allowOther: true,
    mapsTo: "business.description",
    category: "business",
  },
  {
    id: "business-industry",
    question: "Which industry are you in?",
    type: "single",
    options: ["Food & drink", "Retail", "Health & beauty", "Professional services", "Creative studio", "Technology"],
    allowOther: true,
    mapsTo: "business.industry",
    category: "business",
  },
  {
    id: "target-audience",
    question: "Who is your ideal customer?",
    help: "For example: “local families”, “early-stage startups”, “brides-to-be”.",
    type: "text",
    options: [],
    allowOther: true,
    mapsTo: "business.targetAudience",
    category: "business",
  },
  {
    id: "primary-goal",
    question: "What is the main goal of the website?",
    type: "single",
    options: ["Get more enquiries", "Sell products online", "Book appointments", "Showcase my work", "Build credibility"],
    allowOther: true,
    mapsTo: "website.primaryGoal",
    category: "business",
  },
  {
    id: "conversion",
    question: "What should a visitor do when they land on the site?",
    type: "single",
    options: ["Send an enquiry", "Buy a product", "Book a table", "Schedule a call", "Subscribe"],
    allowOther: true,
    mapsTo: "website.conversionAction",
    category: "business",
  },
  {
    id: "brand-name",
    question: "What name should the logo show?",
    type: "text",
    options: [],
    allowOther: true,
    mapsTo: "branding.brandName",
    category: "branding",
  },
  {
    id: "brand-style",
    question: "Which look fits your brand best?",
    type: "single",
    options: [...DESIGN_STYLES],
    allowOther: false,
    mapsTo: "branding.style",
    category: "branding",
  },
  {
    id: "primary-color",
    question: "Do you have a brand colour? Send any hex code (e.g. #e11d48) or a colour name.",
    type: "color",
    options: [],
    allowOther: true,
    mapsTo: "branding.primaryColor",
    category: "branding",
  },
  {
    id: "required-pages",
    question: "Which pages do you need?",
    help: "Pick as many as you like - you can change this later.",
    type: "multi",
    options: PAGE_KEYWORDS.slice(0, 9).map((entry) => entry.name),
    allowOther: true,
    mapsTo: "website.requiredPages",
    category: "pages",
  },
  {
    id: "headline",
    question: "What should the homepage say at the very top?",
    help: "A short headline - 8 words or fewer works best.",
    type: "text",
    options: [],
    allowOther: true,
    mapsTo: "content.headline",
    category: "content",
  },
  {
    id: "contact-email",
    question: "What email address should enquiries go to?",
    type: "text",
    options: [],
    allowOther: true,
    mapsTo: "content.contact.email",
    category: "content",
  },
  {
    id: "tone",
    question: "How should the site sound?",
    type: "single",
    options: ["Friendly and casual", "Professional and direct", "Warm and personal", "Bold and confident"],
    allowOther: true,
    mapsTo: "website.toneOfVoice",
    category: "branding",
  },
  {
    id: "domain",
    question: "Do you already own a domain name?",
    type: "text",
    options: [],
    allowOther: true,
    mapsTo: "technical.domain",
    category: "technical",
  },
  {
    id: "seo-description",
    question: "How would you describe your business to someone searching on Google?",
    type: "long-text",
    options: [],
    allowOther: true,
    mapsTo: "technical.seo.defaultDescription",
    category: "seo",
  },
];

/** The interview in order, with defaults filled in for optional fields. */
export const INTERVIEW_QUESTIONS: InterviewQuestion[] = rawQuestions.map((question) => ({
  help: "",
  ...question,
}));

function readPath(source: Requirements, path: string): unknown {
  let cursor: unknown = source;
  for (const key of path.split(".")) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** The first unanswered question, or `null` when the interview is complete. */
export function nextQuestion(requirements: Requirements): InterviewQuestion | null {
  for (const question of INTERVIEW_QUESTIONS) {
    if (!isAnswered(readPath(requirements, question.mapsTo))) return question;
  }
  return null;
}

export function completenessSnapshot(report: CompletenessReport): CompletenessSnapshot {
  return {
    overall: report.overall,
    readyForGeneration: report.readyForGeneration,
    blocking: report.blocking,
    categories: report.categories.map((category) => ({
      key: category.key,
      label: category.label || COMPLETENESS_LABELS[category.key],
      score: category.score,
      applicable: category.applicable,
      missing: category.missing,
    })),
  };
}
