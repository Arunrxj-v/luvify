/**
 * Website-archetype classification and page planning.
 *
 * The archetype is NOT a keyword guess: every signal is scored, explicit
 * client statements (required pages, chosen features) outrank vocabulary, and
 * anything that fails to clear the relevance bar classifies as "custom" - a
 * structure built entirely from the client's requirements.
 */

export const WEBSITE_ARCHETYPES = [
  "ecommerce",
  "saas",
  "healthcare",
  "restaurant",
  "portfolio",
  "agency",
  "business",
  "education",
  "event",
  "booking",
  "realestate",
  "nonprofit",
  "community",
  "blog",
  "marketplace",
  "landing",
  "personal",
  "custom",
] as const;
export type WebsiteArchetype = (typeof WEBSITE_ARCHETYPES)[number];

export interface ArchetypePage {
  name: string;
  path: string;
  purpose: string;
}

/** Canonical page architecture per archetype; purposes justify each page. */
export const ARCHETYPE_ARCHITECTURES: Record<Exclude<WebsiteArchetype, "custom">, ArchetypePage[]> = {
  ecommerce: [
    { name: "Home", path: "/", purpose: "Introduce the store and drive shoppers into the catalogue" },
    { name: "Shop", path: "/shop", purpose: "Browse the product catalogue by category" },
    { name: "Product", path: "/product", purpose: "Product details with add-to-cart and variant selection" },
    { name: "Cart", path: "/cart", purpose: "Review the basket before checkout" },
    { name: "Checkout", path: "/checkout", purpose: "Complete payment and delivery details" },
    { name: "About", path: "/about", purpose: "Tell the brand story to build buying confidence" },
    { name: "Contact", path: "/contact", purpose: "Support enquiries for orders and returns" },
  ],
  saas: [
    { name: "Home", path: "/", purpose: "Position the product and drive trial sign-up" },
    { name: "Features", path: "/features", purpose: "Explain what the product does in depth" },
    { name: "Pricing", path: "/pricing", purpose: "Compare plans and convert trials to paid" },
    { name: "About", path: "/about", purpose: "Introduce the company behind the product" },
    { name: "Contact", path: "/contact", purpose: "Sales and support enquiries" },
  ],
  healthcare: [
    { name: "Home", path: "/", purpose: "Explain the service and drive appointment booking" },
    { name: "Doctors", path: "/doctors", purpose: "Find a doctor, optionally by specialty" },
    { name: "Doctor Profile", path: "/doctors/profile", purpose: "Qualifications, specialties and availability for one doctor" },
    { name: "Departments", path: "/departments", purpose: "Browse medical specialties and services" },
    { name: "Book Appointment", path: "/booking", purpose: "Select a doctor, time slot and confirm the visit" },
    { name: "About", path: "/about", purpose: "Introduce the clinic or hospital and its standards of care" },
    { name: "Contact", path: "/contact", purpose: "Directions, hours and general enquiries" },
    { name: "FAQ", path: "/faq", purpose: "Answer questions about visits, insurance and preparation" },
  ],
  restaurant: [
    { name: "Home", path: "/", purpose: "Showcase the food and drive reservations or orders" },
    { name: "Menu", path: "/menu", purpose: "The full menu with dishes and prices" },
    { name: "Reservations", path: "/reservations", purpose: "Book a table for a date and party size" },
    { name: "About", path: "/about", purpose: "Tell the story of the kitchen and its people" },
    { name: "Gallery", path: "/gallery", purpose: "Photos of dishes, the room and events" },
    { name: "Contact", path: "/contact", purpose: "Location, hours and directions" },
  ],
  portfolio: [
    { name: "Home", path: "/", purpose: "Introduce the person and their best work" },
    { name: "Work", path: "/work", purpose: "Selected projects with outcomes" },
    { name: "About", path: "/about", purpose: "Background, approach and experience" },
    { name: "Services", path: "/services", purpose: "What clients can hire them for" },
    { name: "Contact", path: "/contact", purpose: "Project enquiries and availability" },
  ],
  agency: [
    { name: "Home", path: "/", purpose: "Position the agency and win project enquiries" },
    { name: "Services", path: "/services", purpose: "Detail the service lines on offer" },
    { name: "Work", path: "/work", purpose: "Case studies proving capability" },
    { name: "About", path: "/about", purpose: "Introduce the team and the studio" },
    { name: "Contact", path: "/contact", purpose: "New-business enquiries" },
  ],
  business: [
    { name: "Home", path: "/", purpose: "Introduce the business and drive the primary enquiry" },
    { name: "Services", path: "/services", purpose: "Detail the services on offer" },
    { name: "About", path: "/about", purpose: "Build trust with the company story" },
    { name: "Contact", path: "/contact", purpose: "Enquiries, quotes and directions" },
  ],
  education: [
    { name: "Home", path: "/", purpose: "Present programmes and drive applications" },
    { name: "Courses", path: "/courses", purpose: "Browse courses or programmes with outcomes" },
    { name: "Admissions", path: "/admissions", purpose: "How to apply, fees and deadlines" },
    { name: "About", path: "/about", purpose: "Introduce the institution and its faculty" },
    { name: "Contact", path: "/contact", purpose: "Enquiries and campus visits" },
  ],
  event: [
    { name: "Home", path: "/", purpose: "Sell the event and drive registrations" },
    { name: "Schedule", path: "/schedule", purpose: "Agenda, sessions and timings" },
    { name: "Speakers", path: "/speakers", purpose: "Who is presenting or performing" },
    { name: "Tickets", path: "/tickets", purpose: "Ticket tiers and registration" },
    { name: "Venue", path: "/venue", purpose: "Location, travel and accommodation" },
    { name: "Contact", path: "/contact", purpose: "Organiser enquiries" },
  ],
  booking: [
    { name: "Home", path: "/", purpose: "Explain the service and drive bookings" },
    { name: "Services", path: "/services", purpose: "What can be booked, with durations and prices" },
    { name: "Book Now", path: "/booking", purpose: "Pick a service, slot and confirm" },
    { name: "About", path: "/about", purpose: "Introduce the people behind the service" },
    { name: "Contact", path: "/contact", purpose: "Location, hours and questions" },
  ],
  realestate: [
    { name: "Home", path: "/", purpose: "Showcase featured listings and start a search" },
    { name: "Listings", path: "/listings", purpose: "Browse properties with filters" },
    { name: "Property", path: "/listings/property", purpose: "Details, photos and viewing request for one property" },
    { name: "About", path: "/about", purpose: "Introduce the agency and its agents" },
    { name: "Contact", path: "/contact", purpose: "Viewing requests and valuations" },
  ],
  nonprofit: [
    { name: "Home", path: "/", purpose: "Explain the mission and drive donations or volunteering" },
    { name: "Our Work", path: "/work", purpose: "Programmes and their impact" },
    { name: "Get Involved", path: "/get-involved", purpose: "Donate, volunteer or fundraise" },
    { name: "About", path: "/about", purpose: "History, team and governance" },
    { name: "Contact", path: "/contact", purpose: "General enquiries and press" },
  ],
  community: [
    { name: "Home", path: "/", purpose: "Welcome members and explain what the community does" },
    { name: "Events", path: "/events", purpose: "Upcoming gatherings and how to join" },
    { name: "About", path: "/about", purpose: "Purpose, organisers and guidelines" },
    { name: "Join", path: "/join", purpose: "Become a member" },
    { name: "Contact", path: "/contact", purpose: "Questions and suggestions" },
  ],
  blog: [
    { name: "Home", path: "/", purpose: "Surface the latest writing" },
    { name: "Articles", path: "/articles", purpose: "Browse all articles by topic" },
    { name: "About", path: "/about", purpose: "Who writes here and why" },
    { name: "Contact", path: "/contact", purpose: "Tips, feedback and commissions" },
  ],
  marketplace: [
    { name: "Home", path: "/", purpose: "Explain the marketplace and onboard both sides" },
    { name: "Browse", path: "/browse", purpose: "Search listings from sellers or providers" },
    { name: "How It Works", path: "/how-it-works", purpose: "Trust, payments and process for buyers and sellers" },
    { name: "Pricing", path: "/pricing", purpose: "Fees and plans for sellers" },
    { name: "About", path: "/about", purpose: "Introduce the team behind the marketplace" },
    { name: "Contact", path: "/contact", purpose: "Support for buyers and sellers" },
  ],
  landing: [{ name: "Home", path: "/", purpose: "Convert visitors on a single focused offer" }],
  personal: [
    { name: "Home", path: "/", purpose: "Introduce the person and their work" },
    { name: "About", path: "/about", purpose: "Background and experience" },
    { name: "Writing", path: "/writing", purpose: "Essays and notes" },
    { name: "Contact", path: "/contact", purpose: "Get in touch" },
  ],
};

/** Vocabulary scored per archetype (lowercase substring matching). */
const ARCHETYPE_SIGNALS: Record<Exclude<WebsiteArchetype, "custom">, string[]> = {
  ecommerce: ["shop", "store", "products", "cart", "checkout", "sell online", "catalog", "order online", "shipping", "inventory"],
  saas: ["saas", "software", "platform", "subscription", "pricing plans", "free trial", "dashboard", "api", "onboarding", "churn", "automation", "workflow", "b2b", "integration", "users", "app"],
  healthcare: ["hospital", "clinic", "doctor", "patient", "appointment", "medical", "dental", "dentist", "pharmacy", "diagnosis", "treatment", "specialty", "specialist", "surgeon", "surgery", "nurse", "physician", "therapist", "physiotherapy", "telehealth", "vaccination"],
  restaurant: ["restaurant", "menu", "cafe", "bakery", "cake", "pastry", "bread", "coffee", "food", "dish", "reservation", "table booking", "cuisine", "chef", "catering", "takeaway", "dining", "kitchen", "bistro", "diner", "eatery", "dessert", "sweets", "brewery"],
  portfolio: ["portfolio", "photography", "photographer", "designer", "artist", "illustrator", "videographer", "filmmaker", "showcase", "case stud", "creative work", "freelance"],
  agency: ["agency", "studio", "clients", "branding", "marketing", "consultancy", "consulting", "campaigns", "web design", "advertising", "public relations"],
  business: ["service", "company", "business", "consultation", "quote", "contractor", "cleaning", "repair", "law firm", "accounting", "plumbing", "electrician", "landscaping", "salon", "barber", "spa", "gym", "fitness", "logistics", "moving company"],
  education: ["school", "course", "student", "learn", "university", "training", "classes", "admissions", "curriculum", "tutor", "academy", "bootcamp"],
  event: ["event", "conference", "festival", "concert", "workshop", "tickets", "speakers", "venue", "summit", "expo"],
  booking: ["booking", "reservation", "appointments", "book online", "schedule", "availability", "time slot"],
  realestate: ["real estate", "property", "listings", "apartment", "house for sale", "realtor", "broker", "mortgage"],
  nonprofit: ["nonprofit", "charity", "donate", "volunteer", "mission", "foundation", "fundraising", "cause"],
  community: ["community", "members", "club", "association", "meetup", "neighbourhood", "forum"],
  blog: ["blog", "articles", "news", "editorial", "insights", "journal", "stories"],
  marketplace: ["marketplace", "sellers", "buyers", "vendors", "commission", "two-sided"],
  landing: ["landing", "launch", "waitlist", "coming soon", "single page", "one page"],
  personal: ["resume", "cv", "personal brand", "about me", "hire me"],
};

export interface ArchetypeInput {
  productSummary?: string;
  description?: string;
  industry?: string;
  websiteType?: string;
  requiredPages?: string[];
  features?: Record<string, boolean>;
  audience?: string;
  purpose?: string;
}

/**
 * Website types the client can pick that already state the structure. Generic
 * values ("business", "other") are deliberately absent: they carry no
 * structural information and would mask a better classification.
 */
const EXPLICIT_TYPE_ARCHETYPES: Record<string, WebsiteArchetype | undefined> = {
  ecommerce: "ecommerce",
  saas: "saas",
  restaurant: "restaurant",
  portfolio: "portfolio",
  agency: "agency",
  blog: "blog",
  personal: "personal",
  landing: "landing",
};

/** Explicit page/functionality demands mapped to the archetypes that own them. */
const PAGE_ARCHETYPE_HINTS: Array<{ archetype: WebsiteArchetype; hints: string[] }> = [
  { archetype: "ecommerce", hints: ["cart", "checkout", "shop", "store", "catalog", "product page"] },
  { archetype: "healthcare", hints: ["doctor", "doctors", "appointment", "patient", "specialty", "clinic", "hospital", "department"] },
  { archetype: "restaurant", hints: ["menu", "reservation", "order food", "table"] },
  { archetype: "saas", hints: ["pricing", "features page", "free trial", "documentation", "docs"] },
  { archetype: "portfolio", hints: ["portfolio", "case studies", "gallery of work"] },
  { archetype: "blog", hints: ["blog", "articles", "news"] },
  { archetype: "booking", hints: ["book online", "booking page", "reservations page"] },
];

function collectText(input: ArchetypeInput): string {
  return [
    input.productSummary ?? "",
    input.description ?? "",
    input.industry ?? "",
    input.audience ?? "",
    input.purpose ?? "",
    (input.requiredPages ?? []).join(" "),
  ]
    .join("\n")
    .toLowerCase();
}

/**
 * Classifies the project into a structural archetype. The product summary
 * carries extra weight (it is the client's own statement of what is being
 * built); explicit page/feature demands outrank vocabulary. Returns "custom"
 * when nothing clears the bar, so generation builds the structure from the
 * requirements instead of forcing a template.
 */
export function classifyArchetype(input: ArchetypeInput): WebsiteArchetype {
  const text = collectText(input);
  const pageText = (input.requiredPages ?? []).join(" ").toLowerCase();
  const featureKeys = Object.entries(input.features ?? {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key.toLowerCase());

  // The website type the client picked is an explicit structural statement.
  // Generic values ("business", "other") are ignored, so a hospital project
  // created under "business" can still classify as healthcare.
  const explicit = EXPLICIT_TYPE_ARCHETYPES[input.websiteType?.toLowerCase() ?? ""];
  if (explicit && text.trim().length === 0 && pageText.length === 0) return explicit;
  if (!text.trim() && !explicit) return "custom";

  for (const { archetype, hints } of PAGE_ARCHETYPE_HINTS) {
    const haystack = `${pageText} ${featureKeys.join(" ")}`;
    if (!hints.some((hint) => haystack.includes(hint))) continue;
    if (archetype === "ecommerce") {
      const commerceText = `${text} ${haystack}`;
      if (["shop", "store", "sell", "cart", "checkout", "products", "catalog", "order"].some((s) => commerceText.includes(s))) {
        return "ecommerce";
      }
      continue;
    }
    return archetype;
  }

  // The explicit type is a strong signal: honour it when nothing contradicts.
  if (explicit) return explicit;
  if (!text.trim()) return "custom";

  const scores = new Map<WebsiteArchetype, number>();
  const summary = (input.productSummary ?? "").toLowerCase();
  for (const archetype of WEBSITE_ARCHETYPES) {
    if (archetype === "custom") continue;
    const signals = ARCHETYPE_SIGNALS[archetype];
    let score = 0;
    for (const signal of signals) {
      if (text.includes(signal)) score += signal.includes(" ") ? 3 : 1;
      if (summary && summary.includes(signal)) score += signal.includes(" ") ? 4 : 2;
    }
    if (score > 0) scores.set(archetype, score);
  }

  let best: WebsiteArchetype = "custom";
  let bestScore = 0;
  let runnerUp = 0;
  for (const [archetype, score] of scores) {
    if (score > bestScore) {
      runnerUp = bestScore;
      best = archetype;
      bestScore = score;
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }
  // Ambiguity is not a classification: two equally plausible structures mean
  // the requirements (not a template) should decide.
  if (bestScore < 4 || bestScore === runnerUp) return "custom";

  if (best === "ecommerce") {
    const hasIntent =
      /(sell|shop|store|buy|order|products)/.test(text) ||
      ["ecommerce", "payments"].some((key) => featureKeys.includes(key));
    if (!hasIntent) return "custom";
  }
  return best;
}

/** Builds the page plan + user journeys from the archetype and requirements. */
export function planArchitecture(
  archetype: WebsiteArchetype,
  requirements: {
    productSummary?: string;
    offerings?: string[];
    requiredPages?: string[];
    conversionAction?: string;
    targetAudience?: string;
  },
): { pages: ArchetypePage[]; userJourneys: Array<{ goal: string; steps: string[] }> } {
  const offeringText = (requirements.offerings ?? []).join(", ");
  const conversion = requirements.conversionAction?.trim();

  if (archetype === "custom") {
    const pages: ArchetypePage[] = [
      {
        name: "Home",
        path: "/",
        purpose: `Introduce ${requirements.productSummary || "the business"} and drive ${conversion || "enquiries"}`,
      },
    ];
    for (const name of requirements.requiredPages ?? []) {
      const trimmed = name.trim();
      if (!trimmed || trimmed.toLowerCase() === "home") continue;
      const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page";
      pages.push({
        name: trimmed,
        path: `/${slug}`,
        purpose: `Cover ${trimmed.toLowerCase()} for ${requirements.productSummary || "the business"}`,
      });
    }
    if (!pages.some((page) => page.path === "/contact")) {
      pages.push({ name: "Contact", path: "/contact", purpose: "Enquiries and contact details" });
    }
    return {
      pages,
      userJourneys: [{ goal: conversion || "Contact the business", steps: ["Home", conversion || "Contact"] }],
    };
  }

  const pages = ARCHETYPE_ARCHITECTURES[archetype].map((page) => ({ ...page }));
  const requested = new Set((requirements.requiredPages ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean));
  if (requested.size > 0) {
    const planned = new Set(pages.map((page) => page.name.toLowerCase()));
    for (const name of requested) {
      if (planned.has(name) || name === "home") continue;
      const slug = name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page";
      pages.push({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        path: `/${slug}`,
        purpose: `Requested by the client${offeringText ? ` for ${offeringText}` : ""}`,
      });
    }
  }
  return { pages, userJourneys: defaultJourneysFor(archetype, conversion) };
}

function defaultJourneysFor(archetype: WebsiteArchetype, conversion: string | undefined): Array<{ goal: string; steps: string[] }> {
  const book = conversion || "Book";
  switch (archetype) {
    case "ecommerce":
      return [
        { goal: "Buy a product", steps: ["Home", "Shop", "Product", "Cart", "Checkout"] },
        { goal: "Learn about the brand", steps: ["Home", "About", "Shop"] },
      ];
    case "healthcare":
      return [
        { goal: "Book an appointment", steps: ["Home", "Doctors", "Doctor Profile", "Book Appointment"] },
        { goal: "Browse by specialty", steps: ["Departments", "Doctors", "Book Appointment"] },
        { goal: "Ask the clinic", steps: ["Home", "Contact"] },
      ];
    case "restaurant":
      return [
        { goal: "Reserve a table", steps: ["Home", "Menu", "Reservations"] },
        { goal: "Find the restaurant", steps: ["Home", "Contact"] },
      ];
    case "portfolio":
      return [
        { goal: "Hire for a project", steps: ["Home", "Work", "About", "Contact"] },
        { goal: "Understand the offer", steps: ["Home", "Services", "Contact"] },
      ];
    default:
      return [{ goal: book, steps: ["Home", "Contact"] }];
  }
}

/** Sections that imply a capability the client never asked for. */
const COMMERCE_SECTIONS = new Set(["ProductGrid", "ProductCard", "Pricing"]);

/**
 * Removes pages that contradict the classified archetype (e.g. Shop / Cart /
 * Checkout on a hospital site). Client-requested pages always survive; the
 * home page always survives.
 */
export function stripIrrelevantPages(
  pages: Array<{ name: string; path: string }>,
  archetype: WebsiteArchetype,
  options: { requested?: string[]; commerce?: boolean } = {},
): Array<{ name: string; path: string }> {
  const requested = new Set((options.requested ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean));
  const isRequested = (page: { name: string; path: string }) =>
    requested.has(page.name.toLowerCase()) || requested.has(page.path.toLowerCase().replace(/^\//, ""));
  const slugOf = (path: string) => path.toLowerCase().replace(/^\//, "").split("/")[0] ?? "";
  const COMMERCE_PAGES = new Set(["shop", "cart", "checkout", "product", "products"]);

  return pages.filter((page) => {
    if (isRequested(page)) return true;
    if (page.path === "/") return true;
    if (!options.commerce && archetype !== "ecommerce" && archetype !== "marketplace") {
      if (COMMERCE_PAGES.has(slugOf(page.path)) || COMMERCE_PAGES.has(page.name.toLowerCase())) return false;
    }
    return true;
  });
}

/** Sections that must not render when the project has no commerce intent. */
export function stripIrrelevantSections(sections: string[], commerce: boolean): string[] {
  if (commerce) return sections;
  return sections.filter((section) => !COMMERCE_SECTIONS.has(section));
}

/** Human label used in the spec panel and summaries. */
export function archetypeLabel(archetype: string): string {
  const labels: Record<string, string> = {
    ecommerce: "E-commerce store",
    saas: "SaaS product",
    healthcare: "Healthcare appointment platform",
    restaurant: "Restaurant / food",
    portfolio: "Portfolio",
    agency: "Agency / studio",
    business: "Business / services",
    education: "Education",
    event: "Event",
    booking: "Booking / reservations",
    realestate: "Real estate",
    nonprofit: "Nonprofit",
    community: "Community",
    blog: "Blog / content",
    marketplace: "Marketplace",
    landing: "Landing page",
    personal: "Personal website",
    custom: "Custom",
  };
  return labels[archetype] ?? "Custom";
}