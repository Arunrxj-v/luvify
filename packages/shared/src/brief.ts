import { z } from "zod";
import { DESIGN_STYLES } from "./enums";
import { RequirementsSchema, hasValue, type Requirements } from "./requirements";
import type { AssetKind } from "./assets";

/**
 * The client brief: structured, domain-aware business information the client
 * supplies so generation can use REAL facts (prices, menus, contact details,
 * services) instead of inventing them.
 *
 * Design rules:
 *
 * 1. CONFIGURATION, NOT CODE - every domain (restaurant, hotel, clinic, ...)
 *    is one entry in `BRIEF_DOMAINS`: its fields, collections and asset slots.
 *    The fold/checklist/CSV logic below is generic over that config, so a new
 *    domain is data, not a new screen or a new pipeline branch.
 * 2. THE BRIEF NEVER OVERWRITES THE INTERVIEW - folding into `Requirements`
 *    is fill-if-empty: anything the client already told the interview wins.
 *    The fold is also reversible (`unfoldBrief`), so generation can build from
 *    a brief-enriched view while the stored requirements stay owned by the
 *    interview - no second source of truth is persisted.
 * 3. UNMAPPED VALUES BECOME FACTS - fields/collections without a structural
 *    carrier are surfaced to the AI as `knownFacts` strings, so nothing the
 *    client supplied is ever lost from the generation context.
 */

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const BriefItemSchema = z
  .record(z.string().max(60), z.string().max(2000))
  .refine((item) => Object.values(item).some((value) => hasValue(value)), {
    message: "A brief item needs at least one value.",
  });
export type BriefItem = z.infer<typeof BriefItemSchema>;

export const ProjectBriefSchema = z.object({
  /** Explicit domain id ("" = auto-detect from the requirements). */
  domain: z.string().trim().max(40).default(""),
  /** groupId -> { fieldId -> value } */
  fields: z
    .record(z.string().max(40), z.record(z.string().max(60), z.string().max(4000)))
    .default({}),
  /** collectionId -> items */
  collections: z.record(z.string().max(60), z.array(BriefItemSchema).max(120)).default({}),
});
export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;

export function emptyBrief(): ProjectBrief {
  return ProjectBriefSchema.parse({});
}

// ---------------------------------------------------------------------------
// Configuration model
// ---------------------------------------------------------------------------

export type BriefFieldType =
  | "text"
  | "longtext"
  | "email"
  | "tel"
  | "url"
  | "color"
  | "select"
  | "number";

/** Where a field lands in `Requirements` (fill-if-empty - the interview wins). */
export interface BriefFieldMapsTo {
  /** Dotted path, e.g. "content.contact.email". Invalid paths are skipped. */
  path: string;
  /** "lines" splits the value into a string list (pages, USPs, regions). */
  as?: "text" | "lines";
}

export interface BriefCheckContext {
  brief: ProjectBrief;
  requirements: Requirements;
}

export interface BriefFieldDef {
  id: string;
  label: string;
  type?: BriefFieldType;
  options?: string[];
  placeholder?: string;
  help?: string;
  /** Required fields show as "missing" until provided (the "what Luvify needs" list). */
  required?: boolean;
  /** Structural carrier(s). Fields without `mapsTo` become brief facts instead. */
  mapsTo?: BriefFieldMapsTo | BriefFieldMapsTo[];
  /** Custom "already provided?" rule; defaults to a non-empty brief value. */
  provided?: (ctx: BriefCheckContext) => boolean;
}

export type BriefCollectionTarget = "products" | "services" | "team" | "testimonials" | "faq";

export interface BriefCollectionDef {
  id: string;
  title: string;
  /** Singular item label ("Menu item", "Room"). */
  singular: string;
  addLabel: string;
  fields: BriefFieldDef[];
  /** Maps rows into the existing requirements carriers (template + AI sections). */
  mapsTo?: BriefCollectionTarget;
  required?: boolean;
  /** Recognised CSV/Excel headers for import mapping (matched leniently). */
  csvHeaders?: string[];
}

export interface BriefAssetSlotDef {
  /** Globally unique slot id, e.g. "brand.logo", "media.hero". */
  id: string;
  title: string;
  kinds: AssetKind[];
  multiple: boolean;
  required?: boolean;
  help?: string;
}

export interface BriefGroupDef {
  id: string;
  title: string;
  help?: string;
  fields?: BriefFieldDef[];
  collections?: BriefCollectionDef[];
  assets?: BriefAssetSlotDef[];
}

export interface BriefDomainDef {
  id: string;
  label: string;
  keywords: string[];
  groups: BriefGroupDef[];
}

// ---------------------------------------------------------------------------
// Common groups - relevant to every website
// ---------------------------------------------------------------------------

export const COMMON_BRIEF_GROUPS: BriefGroupDef[] = [
  {
    id: "brand",
    title: "Brand",
    help: "How your business should look and introduce itself.",
    fields: [
      {
        id: "name",
        label: "Business / brand name",
        mapsTo: [{ path: "business.name" }, { path: "branding.brandName" }],
      },
      { id: "tagline", label: "Tagline or slogan", mapsTo: { path: "content.subheadline" } },
      { id: "primaryColor", label: "Primary brand color", type: "color", mapsTo: { path: "branding.primaryColor" } },
      { id: "secondaryColor", label: "Secondary brand color", type: "color", mapsTo: { path: "branding.secondaryColor" } },
      { id: "existingAssets", label: "Existing brand assets", type: "longtext", mapsTo: { path: "branding.existingAssets" } },
    ],
    assets: [{ id: "brand.logo", title: "Logo", kinds: ["LOGO"], multiple: false }],
  },
  {
    id: "business",
    title: "Business",
    help: "What you sell or do, in your own words.",
    fields: [
      {
        id: "description",
        label: "What your business does",
        type: "longtext",
        required: true,
        mapsTo: { path: "business.description" },
        provided: (ctx) =>
          hasValue(ctx.brief.fields.business?.description) ||
          hasValue(ctx.requirements.business.description),
      },
      {
        id: "usp",
        label: "What makes you different",
        type: "longtext",
        placeholder: "One point per line",
        mapsTo: { path: "business.uniqueSellingPoints", as: "lines" },
      },
      {
        id: "audience",
        label: "Who your customers are",
        mapsTo: { path: "business.targetAudience" },
        provided: (ctx) =>
          hasValue(ctx.brief.fields.business?.audience) ||
          hasValue(ctx.requirements.business.targetAudience),
      },
      {
        id: "location",
        label: "City / area you serve",
        mapsTo: { path: "business.location" },
        provided: (ctx) =>
          hasValue(ctx.brief.fields.business?.location) ||
          hasValue(ctx.requirements.business.location),
      },
      {
        id: "currency",
        label: "Currency for prices",
        placeholder: "e.g. USD, INR, EUR",
        help: "Used for any prices you enter, so ₹250 never renders as $250.",
        mapsTo: { path: "ecommerce.currency" },
      },
    ],
  },
  {
    id: "contact",
    title: "Contact",
    help: "Details customers can actually reach you on - these are never invented.",
    fields: [
      {
        id: "email",
        label: "Contact email",
        type: "email",
        required: true,
        mapsTo: { path: "content.contact.email" },
        provided: (ctx) =>
          hasValue(ctx.brief.fields.contact?.email) ||
          hasValue(ctx.brief.fields.contact?.phone) ||
          hasValue(ctx.requirements.content.contact.email) ||
          hasValue(ctx.requirements.content.contact.phone),
      },
      {
        id: "phone",
        label: "Phone number",
        type: "tel",
        mapsTo: { path: "content.contact.phone" },
        provided: (ctx) =>
          hasValue(ctx.brief.fields.contact?.phone) ||
          hasValue(ctx.requirements.content.contact.phone),
      },
      { id: "whatsapp", label: "WhatsApp", type: "tel" },
      {
        id: "address",
        label: "Address",
        type: "longtext",
        mapsTo: { path: "content.contact.address" },
        provided: (ctx) =>
          hasValue(ctx.brief.fields.contact?.address) ||
          hasValue(ctx.requirements.content.contact.address),
      },
      {
        id: "hours",
        label: "Opening hours",
        type: "longtext",
        placeholder: "Mon–Fri 9:00–18:00",
        mapsTo: { path: "content.contact.hours" },
        provided: (ctx) =>
          hasValue(ctx.brief.fields.contact?.hours) ||
          hasValue(ctx.requirements.content.contact.hours),
      },
      { id: "mapUrl", label: "Google Maps link", type: "url", mapsTo: { path: "content.contact.mapUrl" } },
      { id: "instagram", label: "Instagram", mapsTo: { path: "content.socials.instagram" } },
      { id: "facebook", label: "Facebook", mapsTo: { path: "content.socials.facebook" } },
      { id: "youtube", label: "YouTube", mapsTo: { path: "content.socials.youtube" } },
      { id: "linkedin", label: "LinkedIn", mapsTo: { path: "content.socials.linkedin" } },
    ],
  },
  {
    id: "media",
    title: "Photos & media",
    help: "Real photos are how your website stops looking like a template.",
    assets: [
      {
        id: "media.hero",
        title: "Hero / cover photos",
        kinds: ["PHOTO"],
        multiple: true,
        help: "The first image becomes your homepage hero.",
      },
      {
        id: "media.gallery",
        title: "Gallery photos",
        kinds: ["PHOTO"],
        multiple: true,
        help: "Interior, products, work - anything worth showing off.",
      },
      {
        id: "media.people",
        title: "Team / people photos",
        kinds: ["PHOTO"],
        multiple: true,
        help: "Matched to your team members by name.",
      },
      { id: "media.video", title: "Videos", kinds: ["VIDEO"], multiple: true },
      { id: "media.other", title: "Other images", kinds: ["PHOTO"], multiple: true },
    ],
  },
  {
    id: "content",
    title: "Page content",
    help: "Copy you want on the site, and the words customers ask about.",
    fields: [
      { id: "headline", label: "Homepage headline", mapsTo: { path: "content.headline" } },
      { id: "about", label: "About text", type: "longtext", mapsTo: { path: "content.about" } },
    ],
    collections: [
      {
        id: "testimonials",
        title: "Testimonials",
        singular: "Testimonial",
        addLabel: "Add testimonial",
        mapsTo: "testimonials",
        csvHeaders: ["quote", "review", "text", "author", "name", "role", "title"],
        fields: [
          { id: "quote", label: "Quote", type: "longtext", required: true },
          { id: "author", label: "Name" },
          { id: "role", label: "Role / company" },
        ],
      },
      {
        id: "faqs",
        title: "FAQs",
        singular: "Question",
        addLabel: "Add question",
        mapsTo: "faq",
        csvHeaders: ["question", "q", "faq", "answer", "a"],
        fields: [
          { id: "question", label: "Question", required: true },
          { id: "answer", label: "Answer", type: "longtext", required: true },
        ],
      },
    ],
  },
  {
    id: "preferences",
    title: "Website preferences",
    help: "How the site should look and what it should (not) contain.",
    fields: [
      {
        id: "style",
        label: "Visual style",
        type: "select",
        options: [...DESIGN_STYLES],
        mapsTo: { path: "branding.style" },
      },
      {
        id: "colorScheme",
        label: "Light or dark site",
        type: "select",
        options: ["No preference", "Light", "Dark"],
      },
      {
        id: "pages",
        label: "Pages you want",
        type: "longtext",
        placeholder: "One per line, e.g.\nMenu\nReservations",
        mapsTo: { path: "website.requiredPages", as: "lines" },
        provided: (ctx) =>
          hasValue(ctx.brief.fields.preferences?.pages) ||
          ctx.requirements.website.requiredPages.length > 0,
      },
      { id: "avoid", label: "Things you don't want", type: "longtext", placeholder: "e.g. no blog, no dark mode" },
      { id: "references", label: "Websites you like", type: "longtext", placeholder: "One per line" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Domain groups - the 17 domain definitions
// ---------------------------------------------------------------------------

const restaurantGroups: BriefGroupDef[] = [
  {
    id: "menu-group",
    title: "Menu",
    help: "Your real dishes and prices - they appear on the Menu page verbatim.",
    collections: [
      {
        id: "menu",
        title: "Menu",
        singular: "Menu item",
        addLabel: "Add menu item",
        mapsTo: "services",
        required: true,
        csvHeaders: ["name", "item", "dish", "title", "description", "price", "rate", "amount", "category", "section", "diet", "vegetarian"],
        fields: [
          { id: "name", label: "Dish name", required: true },
          { id: "description", label: "Description", type: "longtext" },
          { id: "price", label: "Price", placeholder: "e.g. ₹250" },
          { id: "category", label: "Section", placeholder: "Starters, Mains, Drinks..." },
          { id: "diet", label: "Dietary note", placeholder: "Vegan, Gluten-free..." },
        ],
      },
    ],
  },
];

const hotelGroups: BriefGroupDef[] = [
  {
    id: "stay",
    title: "Stay details",
    fields: [
      { id: "checkIn", label: "Check-in time", placeholder: "e.g. 14:00" },
      { id: "checkOut", label: "Check-out time", placeholder: "e.g. 11:00" },
      { id: "policies", label: "House policies", type: "longtext" },
    ],
  },
  {
    id: "rooms-group",
    title: "Rooms",
    collections: [
      {
        id: "rooms",
        title: "Rooms",
        singular: "Room",
        addLabel: "Add room",
        mapsTo: "products",
        required: true,
        csvHeaders: ["name", "room", "type", "title", "description", "price", "rate", "night", "capacity", "amenities", "category"],
        fields: [
          { id: "name", label: "Room name", required: true },
          { id: "description", label: "Description", type: "longtext" },
          { id: "price", label: "Price per night", placeholder: "e.g. ₹4,500" },
          { id: "category", label: "Room type", placeholder: "Deluxe, Suite..." },
          { id: "amenities", label: "Key amenities", placeholder: "Wi-Fi, breakfast, sea view" },
        ],
      },
      {
        id: "facilities",
        title: "Facilities & services",
        singular: "Facility",
        addLabel: "Add facility",
        mapsTo: "services",
        csvHeaders: ["name", "facility", "service", "description", "price"],
        fields: [
          { id: "name", label: "Name", required: true },
          { id: "description", label: "Description", type: "longtext" },
          { id: "price", label: "Price (if any)" },
        ],
      },
    ],
  },
];

const healthcareGroups: BriefGroupDef[] = [
  {
    id: "practice",
    title: "Practice details",
    fields: [
      { id: "appointment", label: "How patients book", type: "longtext", placeholder: "Walk-in, phone, online..." },
      { id: "insurance", label: "Insurance / coverage notes", type: "longtext" },
      { id: "registration", label: "Registration / license numbers", placeholder: "Leave empty if not applicable" },
    ],
  },
  {
    id: "care-group",
    title: "Services & team",
    collections: [
      {
        id: "services",
        title: "Services",
        singular: "Service",
        addLabel: "Add service",
        mapsTo: "services",
        required: true,
        csvHeaders: ["name", "service", "title", "description", "price", "fee", "duration"],
        fields: [
          { id: "name", label: "Service name", required: true },
          { id: "description", label: "Description", type: "longtext" },
          { id: "price", label: "Fee / price", placeholder: "e.g. ₹800" },
          { id: "duration", label: "Duration", placeholder: "e.g. 30 min" },
        ],
      },
      {
        id: "doctors",
        title: "Doctors / specialists",
        singular: "Person",
        addLabel: "Add person",
        mapsTo: "team",
        csvHeaders: ["name", "doctor", "specialist", "role", "qualification", "specialty", "bio", "about"],
        fields: [
          { id: "name", label: "Name", required: true },
          { id: "role", label: "Specialty / qualification", placeholder: "e.g. MD, Cardiology" },
          { id: "bio", label: "Short bio", type: "longtext" },
        ],
      },
      {
        id: "departments",
        title: "Departments",
        singular: "Department",
        addLabel: "Add department",
        mapsTo: "services",
        csvHeaders: ["name", "department", "unit", "description"],
        fields: [
          { id: "name", label: "Department", required: true },
          { id: "description", label: "Description", type: "longtext" },
        ],
      },
    ],
  },
];

const catalogGroups = (
  title: string,
  singular: string,
  collectionId: string,
  csvHeaders: string[],
  categoryLabel: string,
): BriefGroupDef[] => [
  {
    id: "catalog-group",
    title,
    collections: [
      {
        id: collectionId,
        title,
        singular,
        addLabel: `Add ${singular.toLowerCase()}`,
        mapsTo: "products",
        required: true,
        csvHeaders,
        fields: [
          { id: "name", label: "Name", required: true },
          { id: "description", label: "Description", type: "longtext" },
          { id: "price", label: "Price", placeholder: "e.g. ₹1,299" },
          { id: "category", label: categoryLabel },
        ],
      },
    ],
  },
];

const serviceListGroups = (
  title: string,
  singular: string,
  collectionId: string,
  csvHeaders: string[],
  withPrice = true,
): BriefGroupDef[] => [
  {
    id: "services-group",
    title,
    collections: [
      {
        id: collectionId,
        title,
        singular,
        addLabel: `Add ${singular.toLowerCase()}`,
        mapsTo: "services",
        required: true,
        csvHeaders,
        fields: [
          { id: "name", label: "Name", required: true },
          { id: "description", label: "Description", type: "longtext" },
          ...(withPrice ? [{ id: "price", label: "Price", placeholder: "e.g. ₹2,000" } as BriefFieldDef] : []),
        ],
      },
    ],
  },
];

export const BRIEF_DOMAINS: BriefDomainDef[] = [
  { id: "restaurant", label: "Restaurant / cafe", keywords: ["restaurant", "cafe", "café", "coffee", "bakery", "bistro", "kitchen", "diner", "food", "menu", "catering", "pizzeria", "ramen", "deli", "eatery"], groups: restaurantGroups },
  { id: "hotel", label: "Hotel / stay", keywords: ["hotel", "resort", "hostel", "guesthouse", "guest house", "lodge", "rooms", "stay", "accommodation", "motel", "inn", "villa stay"], groups: hotelGroups },
  { id: "doctor", label: "Doctor / clinic", keywords: ["doctor", "clinic", "physician", "dental", "dentist", "physio", "therapy", "medical", "healthcare", "appointment", "specialist", "surgeon", "pediatric", "practice"], groups: healthcareGroups },
  { id: "hospital", label: "Hospital", keywords: ["hospital", "ward", "emergency", "multi-specialty", "multi specialty", "medical centre", "medical center"], groups: healthcareGroups },
  { id: "clothing", label: "Clothing / fashion", keywords: ["clothing", "apparel", "fashion", "boutique", "tshirt", "t-shirt", "garments", "dresses", "sneakers", "jewelry", "jewellery", "wear"], groups: catalogGroups("Products", "Product", "products", ["name", "product", "item", "title", "description", "price", "amount", "category", "size", "color"], "Category") },
  { id: "ecommerce", label: "E-commerce store", keywords: ["store", "shop", "ecommerce", "e-commerce", "sell", "products", "catalog", "catalogue", "retail", "cart", "checkout", "online store"], groups: catalogGroups("Products", "Product", "products", ["name", "product", "item", "title", "description", "price", "amount", "category"], "Category") },
  { id: "realestate", label: "Real estate", keywords: ["real estate", "realtor", "property", "properties", "apartment", "villa", "housing", "listings", "brokerage", "plots", "builder"], groups: catalogGroups("Properties", "Property", "properties", ["name", "property", "title", "description", "price", "location", "bedrooms", "bhk", "category"], "Property type") },
  { id: "photographer", label: "Photographer", keywords: ["photographer", "photography", "photoshoot", "photo shoot", "photo studio", "portraits", "wedding photographer", "shoots"], groups: serviceListGroups("Packages", "Package", "packages", ["name", "package", "title", "description", "price", "duration"]) },
  { id: "agency", label: "Agency / studio", keywords: ["agency", "studio", "design", "branding", "marketing", "consultancy", "consulting", "freelance", "creative", "seo", "web design"], groups: [...serviceListGroups("Services", "Service", "services", ["name", "service", "title", "description", "price"]), { id: "work-group", title: "Selected work", collections: [{ id: "caseStudies", title: "Case studies", singular: "Case study", addLabel: "Add case study", csvHeaders: ["name", "title", "client", "description", "result"], fields: [{ id: "name", label: "Project", required: true }, { id: "client", label: "Client" }, { id: "description", label: "Summary", type: "longtext" }] }] }] },
  { id: "gym", label: "Gym / fitness", keywords: ["gym", "fitness", "workout", "personal trainer", "yoga", "pilates", "crossfit", "personal training", "strength", "exercise"], groups: [...serviceListGroups("Classes & plans", "Class", "classes", ["name", "class", "title", "description", "price", "schedule", "duration"]), { id: "people-group", title: "Trainers", collections: [{ id: "trainers", title: "Trainers", singular: "Trainer", addLabel: "Add trainer", mapsTo: "team" as BriefCollectionTarget, csvHeaders: ["name", "trainer", "coach", "role", "specialty", "bio"], fields: [{ id: "name", label: "Name", required: true }, { id: "role", label: "Specialty" }, { id: "bio", label: "Short bio", type: "longtext" }] }] }] },
  { id: "salon", label: "Salon / spa", keywords: ["salon", "spa", "barber", "hair", "beauty", "nails", "massage", "makeup", "skincare", "unisex"], groups: [...serviceListGroups("Treatments & services", "Service", "services", ["name", "service", "title", "description", "price", "duration"]), { id: "people-group", title: "Team", collections: [{ id: "stylists", title: "Stylists", singular: "Stylist", addLabel: "Add stylist", mapsTo: "team" as BriefCollectionTarget, csvHeaders: ["name", "stylist", "role", "specialty", "bio"], fields: [{ id: "name", label: "Name", required: true }, { id: "role", label: "Role / specialty" }, { id: "bio", label: "Short bio", type: "longtext" }] }] }] },
  { id: "education", label: "Education / courses", keywords: ["school", "academy", "course", "courses", "training", "university", "college", "tutoring", "institute", "bootcamp", "students", "learning"], groups: serviceListGroups("Courses / programs", "Course", "courses", ["name", "course", "title", "description", "price", "duration", "level"]) },
  { id: "event", label: "Event / wedding", keywords: ["wedding", "event", "conference", "party", "ceremony", "planner", "banquet", "venue", "invitation", "rsvp"], groups: [...serviceListGroups("Packages", "Package", "packages", ["name", "package", "title", "description", "price"]), { id: "event-group", title: "Event details", fields: [{ id: "date", label: "Event date" }, { id: "venue", label: "Venue" }, { id: "rsvp", label: "RSVP details", type: "longtext" }] }] },
  { id: "architecture", label: "Architecture / interiors", keywords: ["architect", "architecture", "interior design", "interior", "construction", "landscape", "structural"], groups: [...serviceListGroups("Services", "Service", "services", ["name", "service", "title", "description", "price"]), { id: "projects-group", title: "Projects", collections: [{ id: "projects", title: "Projects", singular: "Project", addLabel: "Add project", csvHeaders: ["name", "project", "title", "description", "location", "year"], fields: [{ id: "name", label: "Project", required: true }, { id: "description", label: "Description", type: "longtext" }, { id: "location", label: "Location" }, { id: "year", label: "Year" }] }] }] },
  { id: "travel", label: "Travel / tours", keywords: ["travel", "tour", "tours", "tourism", "trips", "vacation", "holiday", "itinerary", "destinations", "adventure"], groups: catalogGroups("Tours", "Tour", "tours", ["name", "tour", "title", "description", "price", "duration", "destination"], "Destination") },
  { id: "automotive", label: "Automotive", keywords: ["automotive", "car", "cars", "garage", "dealership", "repair", "bike", "motorcycle", "motor", "tyre", "auto", "vehicle", "detailing"], groups: [...serviceListGroups("Services", "Service", "services", ["name", "service", "title", "description", "price"]), ...catalogGroups("Vehicles / stock", "Vehicle", "vehicles", ["name", "vehicle", "title", "description", "price", "year", "category"], "Type")] },
  { id: "ngo", label: "NGO / charity", keywords: ["ngo", "charity", "nonprofit", "non-profit", "donation", "donate", "foundation", "volunteers", "causes", "social impact", "community"], groups: [...serviceListGroups("Programs", "Program", "programs", ["name", "program", "title", "description"]), { id: "give-group", title: "Giving", fields: [{ id: "donateUrl", label: "Donation link", type: "url" }, { id: "registration", label: "Registration number", placeholder: "Leave empty if not applicable" }] }] },
  { id: "business", label: "Other business", keywords: [], groups: [] },
];

export const BRIEF_DOMAIN_IDS = BRIEF_DOMAINS.map((domain) => domain.id);
export const BRIEF_DOMAIN_OPTIONS = BRIEF_DOMAINS.map((domain) => ({ id: domain.id, label: domain.label }));

/** Generic fallback - present so domain resolution can never be undefined. */
const FALLBACK_DOMAIN: BriefDomainDef = {
  id: "business",
  label: "Other business",
  keywords: [],
  groups: [],
};

/** The domain's own groups followed by the groups every website shares. */
export function resolveBriefGroups(domainId: string): BriefGroupDef[] {
  const domain = BRIEF_DOMAINS.find((entry) => entry.id === domainId) ?? FALLBACK_DOMAIN;
  return [...domain.groups, ...COMMON_BRIEF_GROUPS];
}

export function briefDomainLabel(domainId: string): string {
  return BRIEF_DOMAINS.find((entry) => entry.id === domainId)?.label ?? FALLBACK_DOMAIN.label;
}

// ---------------------------------------------------------------------------
// Domain detection
// ---------------------------------------------------------------------------

const TYPE_TO_DOMAIN: Record<string, string> = {
  restaurant: "restaurant",
  ecommerce: "ecommerce",
  agency: "agency",
};

/**
 * Deterministic domain detection from the interview's requirements: an explicit
 * website type is the strongest signal, then keyword coverage of what the
 * client actually said. Falls back to the generic "business" domain.
 */
export function detectBriefDomain(requirements: Requirements): string {
  const explicit = TYPE_TO_DOMAIN[requirements.website.type];
  const strong = [
    requirements.business.industry,
    requirements.business.productSummary,
    requirements.business.offerings.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  const weak = [
    requirements.business.name,
    requirements.business.description,
    requirements.website.purpose,
    requirements.website.requiredPages.join(" "),
    requirements.content.headline,
    requirements.content.about,
  ]
    .join(" ")
    .toLowerCase();

  let best = "business";
  let bestScore = explicit ? 4 : 0;
  if (explicit) best = explicit;

  for (const domain of BRIEF_DOMAINS) {
    if (domain.id === "business") continue;
    let score = TYPE_TO_DOMAIN[requirements.website.type] === domain.id ? 4 : 0;
    for (const keyword of domain.keywords) {
      if (strong.includes(keyword)) score += 2;
      else if (weak.includes(keyword)) score += 1;
    }
    if (score > bestScore) {
      best = domain.id;
      bestScore = score;
    }
  }
  return best;
}

/** The domain the brief declares, else the detected one. */
export function resolveBriefDomain(brief: ProjectBrief, requirements: Requirements): BriefDomainDef {
  const declared = BRIEF_DOMAINS.find((domain) => domain.id === brief.domain);
  if (declared) return declared;
  const detected = detectBriefDomain(requirements);
  return BRIEF_DOMAINS.find((domain) => domain.id === detected) ?? FALLBACK_DOMAIN;
}

// ---------------------------------------------------------------------------
// Fold / unfold - the brief as a generation view of Requirements
// ---------------------------------------------------------------------------

function fieldTargets(field: BriefFieldDef): BriefFieldMapsTo[] {
  if (!field.mapsTo) return [];
  return Array.isArray(field.mapsTo) ? field.mapsTo : [field.mapsTo];
}

/** Fill-if-empty write along a dotted path. Never overwrites interview data. */
function fillPath(target: Requirements, spec: BriefFieldMapsTo, raw: string): void {
  const keys = spec.path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = target;
  for (const key of keys.slice(0, -1)) {
    node = node?.[key];
    if (node === undefined || node === null) return;
  }
  const leaf = keys[keys.length - 1] ?? "";
  const current = node?.[leaf];
  if (spec.as === "lines") {
    if (!Array.isArray(current) || current.length > 0) return;
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 0) node[leaf] = lines;
    return;
  }
  if (typeof current !== "string" || hasValue(current)) return;
  const value = raw.trim();
  if (value) node[leaf] = value;
}

function byName(existing: Array<{ name: string }>, name: string): boolean {
  const needle = name.trim().toLowerCase();
  return existing.some((entry) => entry.name.trim().toLowerCase() === needle);
}

/** Appends brief collection rows into their requirements carrier (deduplicated). */
function appendCollection(target: Requirements, def: BriefCollectionDef, items: BriefItem[]): void {
  const value = (item: BriefItem, key: string): string => (item[key] ?? "").trim();
  switch (def.mapsTo) {
    case "products": {
      const carrier = target.ecommerce.products.length > 0 ? target.ecommerce.products : target.content.products;
      for (const item of items) {
        const name = value(item, "name");
        if (!name || byName(carrier, name)) continue;
        carrier.push({
          name,
          description: value(item, "description"),
          price: value(item, "price"),
          category: value(item, "category"),
        });
      }
      return;
    }
    case "services": {
      for (const item of items) {
        const name = value(item, "name");
        if (!name || byName(target.content.services, name)) continue;
        target.content.services.push({
          name,
          description: value(item, "description"),
          price: value(item, "price"),
        });
      }
      return;
    }
    case "team": {
      for (const item of items) {
        const name = value(item, "name");
        if (!name || byName(target.content.team, name)) continue;
        target.content.team.push({ name, role: value(item, "role"), bio: value(item, "bio") });
      }
      return;
    }
    case "testimonials": {
      const quote = (item: BriefItem): string => value(item, "quote");
      for (const item of items) {
        const text = quote(item);
        if (!text) continue;
        const needle = text.trim().toLowerCase();
        if (target.content.testimonials.some((entry) => entry.quote.trim().toLowerCase() === needle)) continue;
        target.content.testimonials.push({
          quote: text,
          author: value(item, "author"),
          role: value(item, "role"),
        });
      }
      return;
    }
    case "faq": {
      for (const item of items) {
        const question = value(item, "question");
        const answer = value(item, "answer");
        if (!question || !answer) continue;
        const needle = question.trim().toLowerCase();
        if (target.content.faq.some((entry) => entry.question.trim().toLowerCase() === needle)) continue;
        target.content.faq.push({ question, answer });
      }
      return;
    }
    default:
  }
}

/**
 * The generation view of the requirements: interview data first, brief values
 * filling every gap. Pure - the stored requirements are never modified, and
 * `unfoldBrief` restores them exactly after generation persists its plan.
 */
export function foldBrief(base: Requirements, brief: ProjectBrief | null | undefined): Requirements {
  const out = RequirementsSchema.parse(base as unknown);
  if (!brief) return out;
  const domain = resolveBriefDomain(brief, out);

  for (const group of resolveBriefGroups(domain.id)) {
    const values = brief.fields[group.id] ?? {};
    for (const field of group.fields ?? []) {
      const raw = (values[field.id] ?? "").trim();
      if (!raw) continue;
      for (const target of fieldTargets(field)) fillPath(out, target, raw);
    }
    for (const collection of group.collections ?? []) {
      const items = brief.collections[collection.id] ?? [];
      if (items.length > 0 && collection.mapsTo) appendCollection(out, collection, items);
    }
  }
  return out;
}

/**
 * Restores every path `foldBrief` may have written from the pre-fold
 * requirements while keeping the plan/summary the AI derived during
 * generation. `unfoldBrief(foldBrief(x), x)` deep-equals `x`.
 */
export function unfoldBrief(folded: Requirements, base: Requirements): Requirements {
  const out = RequirementsSchema.parse(folded as unknown);
  out.business = {
    ...out.business,
    name: base.business.name,
    description: base.business.description,
    targetAudience: base.business.targetAudience,
    location: base.business.location,
    uniqueSellingPoints: [...base.business.uniqueSellingPoints],
  };
  out.branding = {
    ...out.branding,
    brandName: base.branding.brandName,
    primaryColor: base.branding.primaryColor,
    secondaryColor: base.branding.secondaryColor,
    style: base.branding.style,
    existingAssets: base.branding.existingAssets,
  };
  out.content = {
    ...out.content,
    headline: base.content.headline,
    subheadline: base.content.subheadline,
    about: base.content.about,
    services: base.content.services.map((entry) => ({ ...entry })),
    products: base.content.products.map((entry) => ({ ...entry })),
    testimonials: base.content.testimonials.map((entry) => ({ ...entry })),
    faq: base.content.faq.map((entry) => ({ ...entry })),
    team: base.content.team.map((entry) => ({ ...entry })),
    contact: { ...base.content.contact },
    socials: { ...base.content.socials },
  };
  out.ecommerce = {
    ...out.ecommerce,
    products: base.ecommerce.products.map((entry) => ({ ...entry })),
    currency: base.ecommerce.currency,
    shipping: { ...base.ecommerce.shipping, regions: [...base.ecommerce.shipping.regions] },
  };
  out.website = { ...out.website, requiredPages: [...base.website.requiredPages] };
  return out;
}

// ---------------------------------------------------------------------------
// Brief facts - everything unmapped, as known-fact strings
// ---------------------------------------------------------------------------

const CORE_FIELDS: Record<BriefCollectionTarget, string[]> = {
  products: ["name", "description", "price", "category"],
  services: ["name", "description", "price"],
  team: ["name", "role", "bio"],
  testimonials: ["quote", "author", "role"],
  faq: ["question", "answer"],
};

const FACT_VALUE_LIMIT = 300;
const FACT_LIMIT = 80;

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

/**
 * Human-readable facts for every brief value that has no structural carrier -
 * plus the extra columns of mapped collections ("amenities", "diet", ...).
 * These land in `ProjectKnowledge.knownFacts`, so the AI is grounded in them.
 */
export function briefKnownFacts(
  brief: ProjectBrief | null | undefined,
  requirements: Requirements,
): string[] {
  if (!brief) return [];
  const domain = resolveBriefDomain(brief, requirements);
  const facts: string[] = [];

  for (const group of resolveBriefGroups(domain.id)) {
    const values = brief.fields[group.id] ?? {};
    for (const field of group.fields ?? []) {
      if (facts.length >= FACT_LIMIT) return facts;
      const raw = (values[field.id] ?? "").trim();
      if (!raw || fieldTargets(field).length > 0) continue;
      facts.push(`${field.label}: ${truncate(raw, FACT_VALUE_LIMIT)}`);
    }
    for (const collection of group.collections ?? []) {
      const items = brief.collections[collection.id] ?? [];
      if (items.length === 0) continue;
      const core = collection.mapsTo ? CORE_FIELDS[collection.mapsTo] : [];
      for (const item of items) {
        if (facts.length >= FACT_LIMIT) return facts;
        const parts: string[] = [];
        for (const field of collection.fields) {
          const raw = (item[field.id] ?? "").trim();
          if (!raw) continue;
          if (core.includes(field.id)) {
            if (field.id === "name") parts.unshift(`${collection.singular}: ${truncate(raw, 120)}`);
            continue;
          }
          parts.push(`${field.label}: ${truncate(raw, FACT_VALUE_LIMIT)}`);
        }
        if (parts.length > 0) facts.push(parts.join(" - "));
      }
    }
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Checklist - "what does Luvify still need from me?"
// ---------------------------------------------------------------------------

export type BriefItemState = "provided" | "missing" | "optional";

export interface BriefCheckItem {
  /** `groupId.fieldId` / `groupId.collectionId` / slot id. */
  id: string;
  label: string;
  kind: "field" | "collection" | "asset";
  state: BriefItemState;
}

export interface BriefCheckGroup {
  id: string;
  title: string;
  state: "provided" | "partial" | "missing";
  items: BriefCheckItem[];
}

export interface BriefChecklist {
  domain: string;
  groups: BriefCheckGroup[];
  provided: number;
  missing: number;
  optional: number;
  ready: boolean;
  /** Required things still missing - the actionable "still needs" list. */
  missingLabels: string[];
}

/**
 * Per-group readiness across the brief, the interview's requirements and the
 * uploaded assets. Required-but-empty items are "missing"; everything else
 * that is empty is honestly "optional" - the client is never blocked.
 */
export function briefChecklist(
  brief: ProjectBrief,
  requirements: Requirements,
  assetCounts: Record<string, number> = {},
): BriefChecklist {
  const domain = resolveBriefDomain(brief, requirements);
  const ctx: BriefCheckContext = { brief, requirements };
  const groups: BriefCheckGroup[] = [];
  let provided = 0;
  let missing = 0;
  let optional = 0;
  const missingLabels: string[] = [];

  for (const group of resolveBriefGroups(domain.id)) {
    const items: BriefCheckItem[] = [];
    const values = brief.fields[group.id] ?? {};

    for (const field of group.fields ?? []) {
      const isProvided = field.provided
        ? field.provided(ctx)
        : hasValue(values[field.id]);
      const state: BriefItemState = isProvided ? "provided" : field.required ? "missing" : "optional";
      items.push({ id: `${group.id}.${field.id}`, label: field.label, kind: "field", state });
      if (state === "provided") provided += 1;
      else if (state === "missing") {
        missing += 1;
        missingLabels.push(field.label);
      } else optional += 1;
    }

    for (const collection of group.collections ?? []) {
      const count = (brief.collections[collection.id] ?? []).length;
      const state: BriefItemState = count > 0 ? "provided" : collection.required ? "missing" : "optional";
      items.push({ id: `${group.id}.${collection.id}`, label: collection.title, kind: "collection", state });
      if (state === "provided") provided += 1;
      else if (state === "missing") {
        missing += 1;
        missingLabels.push(collection.title);
      } else optional += 1;
    }

    for (const slot of group.assets ?? []) {
      const count = assetCounts[slot.id] ?? 0;
      const state: BriefItemState = count > 0 ? "provided" : slot.required ? "missing" : "optional";
      items.push({ id: slot.id, label: slot.title, kind: "asset", state });
      if (state === "provided") provided += 1;
      else if (state === "missing") {
        missing += 1;
        missingLabels.push(slot.title);
      } else optional += 1;
    }

    if (items.length === 0) continue;
    const groupState: BriefCheckGroup["state"] =
      items.every((item) => item.state === "provided")
        ? "provided"
        : items.some((item) => item.state !== "optional")
          ? "partial"
          : "missing";
    groups.push({ id: group.id, title: group.title, state: groupState, items });
  }

  return {
    domain: domain.id,
    groups,
    provided,
    missing,
    optional,
    ready: missing === 0,
    missingLabels,
  };
}

// ---------------------------------------------------------------------------
// CSV import mapping
// ---------------------------------------------------------------------------

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Maps parsed CSV rows onto a collection's fields by header name (lenient:
 * "Unit price" -> "price" via known aliases, else substring match). Rows whose
 * `name`/first required field is empty are skipped.
 */
export function mapCollectionRows(
  def: BriefCollectionDef,
  columns: string[],
  rows: Array<Record<string, string>>,
): BriefItem[] {
  const aliases: Record<string, string[]> = {
    item: ["name"], dish: ["name"], title: ["name"], product: ["name"], room: ["name"],
    service: ["name"], class: ["name"], course: ["name"], tour: ["name"], package: ["name"],
    rate: ["price"], amount: ["price"], amountprice: ["price"], cost: ["price"], fee: ["price"],
    unitprice: ["price"], nightly: ["price"],
    section: ["category"], typeof: ["category"], type: ["category"], level: ["category"],
    specialty: ["role"], qualification: ["role"], coach: ["role"], stylist: ["role"],
    review: ["quote"], text: ["quote"], quote: ["quote"],
    q: ["question"], a: ["answer"],
    about: ["bio"], summary: ["description"], details: ["description"],
  };

  const mapping: Record<number, string> = {};
  columns.forEach((column, index) => {
    const key = normalizeKey(column);
    const field = def.fields.find((entry) => normalizeKey(entry.id) === key);
    if (field) {
      mapping[index] = field.id;
      return;
    }
    const byLabel = def.fields.find((entry) => normalizeKey(entry.label) === key);
    if (byLabel) {
      mapping[index] = byLabel.id;
      return;
    }
    for (const [alias, targets] of Object.entries(aliases)) {
      if (key === alias || key.includes(alias)) {
        const target = def.fields.find((entry) => targets.includes(entry.id));
        if (target) {
          mapping[index] = target.id;
          return;
        }
      }
    }
  });

  const items: BriefItem[] = [];
  for (const row of rows) {
    const item: BriefItem = {};
    for (const [indexText, fieldId] of Object.entries(mapping)) {
      const column = columns[Number(indexText)];
      if (!column) continue;
      const raw = (row[column] ?? "").trim();
      if (raw) item[fieldId] = raw.slice(0, 2000);
    }
    const required = def.fields.find((field) => field.required);
    if (required && !item[required.id]) continue;
    if (Object.keys(item).length === 0) continue;
    items.push(item);
  }
  return items;
}

/** Empty item template for the "add row" button. */
export function emptyBriefItem(def: BriefCollectionDef): BriefItem {
  const item: BriefItem = {};
  for (const field of def.fields) item[field.id] = "";
  return item;
}

/** Field values for one group, as stored in the brief. */
export type BriefFields = ProjectBrief["fields"];
