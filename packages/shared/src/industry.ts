/**
 * Industry requirement profiles.
 *
 * The profile layer sits between raw customer input and the website
 * specification. It answers three questions for generation:
 *
 *   1. What does this kind of business usually need on its website?
 *   2. Which of those things did the client actually provide?
 *   3. What must stay missing (and therefore must never be invented)?
 *
 * Profiles are guidance, not facts. A missing item is surfaced to the prompt as
 * missing information; it is never filled with a plausible-sounding default.
 */

import type { WebsiteArchetype } from "./archetypes";
import type { Requirements } from "./requirements";
import { hasValue } from "./requirements";

export const INDUSTRY_PROFILE_IDS = [
  "clothing",
  "ecommerce",
  "restaurant",
  "hotel",
  "portfolio",
  "professional-services",
  "agency",
  "saas",
  "generic",
] as const;
export type IndustryProfileId = (typeof INDUSTRY_PROFILE_IDS)[number];

export type RequirementImportance = "required" | "recommended" | "optional";

export interface IndustryInfoRequirement {
  id: string;
  label: string;
  importance: RequirementImportance;
  /** What to do when this information is absent. */
  guidance?: string;
}

export interface IndustryPageRequirement {
  name: string;
  path: string;
  purpose: string;
  importance: RequirementImportance;
}

export interface IndustryAssetRequirement {
  id: string;
  label: string;
  importance: RequirementImportance;
  /** Asset category ids and/or kinds that satisfy this requirement. */
  categories?: string[];
  kinds?: string[];
  purpose: string;
}

export interface IndustryProfile {
  id: IndustryProfileId;
  label: string;
  summary: string;
  archetype: WebsiteArchetype;
  aliases: string[];
  requiredInformation: IndustryInfoRequirement[];
  recommendedInformation: IndustryInfoRequirement[];
  optionalInformation: IndustryInfoRequirement[];
  requiredPages: IndustryPageRequirement[];
  recommendedPages: IndustryPageRequirement[];
  functionality: Array<{ id: string; label: string; importance: RequirementImportance }>;
  assets: IndustryAssetRequirement[];
  designNotes: string[];
  seoFocus: string[];
}

const info = (
  id: string,
  label: string,
  importance: RequirementImportance,
  guidance?: string,
): IndustryInfoRequirement => ({ id, label, importance, guidance });

const page = (
  name: string,
  path: string,
  purpose: string,
  importance: RequirementImportance = "required",
): IndustryPageRequirement => ({ name, path, purpose, importance });

const asset = (
  id: string,
  label: string,
  purpose: string,
  importance: RequirementImportance,
  categories: string[] = [],
  kinds: string[] = [],
): IndustryAssetRequirement => ({ id, label, purpose, importance, categories, kinds });

const commonRequired = [
  info("brand_name", "Business or brand name", "required", "Use the project name only if the brand name was not supplied."),
  info("description", "What the business does", "required", "Write neutral copy from verified facts; do not invent an origin story."),
  info("target_audience", "Target audience", "required"),
  info("contact_details", "Contact email or phone", "required", "Show a contact form without invented contact values."),
];

const commonRecommended = [
  info("location", "Location or service area", "recommended"),
  info("hours", "Opening hours", "recommended"),
  info("logo", "Logo", "recommended"),
  info("hero_photo", "Hero / cover photo", "recommended"),
  info("brand_colors", "Brand colours", "recommended"),
];

const commonAssets = [
  asset("logo", "Logo", "Use as the official brand mark, never as a product photo.", "recommended", ["brand.logo"], ["LOGO"]),
  asset("hero", "Hero / cover photo", "Use as the homepage hero or a large editorial image.", "recommended", ["media.hero"], ["PHOTO"]),
  asset("gallery", "Gallery photos", "Use only in gallery and page imagery slots.", "optional", ["media.gallery"], ["PHOTO"]),
];

const clothing: IndustryProfile = {
  id: "clothing",
  label: "Clothing / fashion ecommerce",
  summary: "An online clothing store where product discovery, fit information, imagery and a trustworthy purchase path matter.",
  archetype: "ecommerce",
  aliases: ["clothing", "apparel", "fashion", "boutique", "garment", "streetwear", "tshirt", "t-shirt", "hoodie", "dress", "denim", "sneaker", "jewelry", "jewellery", "wear"],
  requiredInformation: [
    ...commonRequired,
    info("products", "Product catalogue with names", "required", "Do not invent products or garment names."),
    info("prices", "Product prices", "required", "Show prices only where supplied; otherwise omit them."),
    info("sizes", "Available sizes", "required", "Do not invent sizes or fit availability."),
    info("colors", "Available colours", "required", "Do not invent colourways."),
    info("product_images", "Product photos", "required", "Use honest image placeholders where a product photo is missing."),
    info("shipping_returns", "Shipping and returns policy", "required", "Never invent delivery times, charges or return windows."),
  ],
  recommendedInformation: [
    ...commonRecommended,
    info("variants", "Variants and stock notes", "recommended"),
    info("categories", "Product categories", "recommended"),
    info("materials_fit", "Materials and fit guidance", "recommended"),
    info("brand_story", "Brand story", "recommended"),
    info("faq", "Answerable FAQs", "recommended"),
  ],
  optionalInformation: [
    info("sku", "SKUs and inventory", "optional"),
    info("care_instructions", "Care instructions", "optional"),
    info("lookbook", "Lookbook / campaign imagery", "optional"),
    info("reviews", "Verified customer reviews", "optional"),
  ],
  requiredPages: [
    page("Home", "/", "Introduce the brand and lead shoppers into the catalogue"),
    page("Shop", "/shop", "Browse products with categories and filters"),
    page("Product", "/product", "Show product imagery, price, description, sizes and colours"),
    page("Contact", "/contact", "Answer order, sizing and returns questions"),
  ],
  recommendedPages: [
    page("About", "/about", "Tell the real brand story and build trust"),
    page("Cart", "/cart", "Review the basket before checkout", "recommended"),
    page("Checkout", "/checkout", "Complete delivery and payment details", "recommended"),
    page("Shipping & Returns", "/shipping-returns", "Explain only client-supplied policies", "recommended"),
  ],
  functionality: [
    { id: "product_catalogue", label: "Product catalogue with categories and filters", importance: "required" },
    { id: "product_detail", label: "Product detail with image gallery and variants", importance: "required" },
    { id: "size_selection", label: "Size and colour selection", importance: "required" },
    { id: "cart", label: "Shopping cart and checkout", importance: "recommended" },
    { id: "search", label: "Product search", importance: "recommended" },
    { id: "reviews", label: "Verified reviews only", importance: "optional" },
  ],
  assets: [
    ...commonAssets,
    asset("product_photos", "Product photos", "Use each file for the matching product only; never substitute unrelated imagery.", "required", ["product", "catalog"], ["PHOTO"]),
    asset("lifestyle", "Lifestyle / campaign photos", "Use for editorial sections, not as a specific product image.", "optional", ["media.gallery", "media.hero"], ["PHOTO"]),
  ],
  designNotes: [
    "Let product imagery lead; keep chrome quiet and consistent.",
    "Product cards must show name, price (when supplied), category and a real or honest placeholder image.",
    "Product detail must make sizes, colours and variants scannable without inventing availability.",
  ],
  seoFocus: ["product names and categories", "fit and material terms supplied by the client", "brand name + location when supplied"],
};

const ecommerce: IndustryProfile = {
  ...clothing,
  id: "ecommerce",
  label: "Ecommerce / online store",
  summary: "An online store where catalogue clarity, product detail and an honest purchase path matter.",
  aliases: ["ecommerce", "e-commerce", "online store", "shop", "store", "retail", "catalogue", "catalog", "sell online", "products"],
  requiredInformation: commonRequired.concat([
    info("products", "Product catalogue with names", "required", "Do not invent products."),
    info("prices", "Product prices", "required", "Show prices only where supplied."),
    info("product_images", "Product photos", "required", "Use honest placeholders instead of unrelated stock photos."),
    info("shipping_returns", "Shipping and returns policy", "required", "Never invent delivery or return terms."),
  ]),
  recommendedInformation: [
    ...commonRecommended,
    info("variants", "Variants", "recommended"),
    info("categories", "Product categories", "recommended"),
    info("faq", "Answerable FAQs", "recommended"),
  ],
  requiredPages: [
    page("Home", "/", "Introduce the store and drive shoppers into the catalogue"),
    page("Shop", "/shop", "Browse the catalogue by category"),
    page("Product", "/product", "Product details with images, price and options"),
    page("Contact", "/contact", "Support enquiries for orders and returns"),
  ],
  functionality: clothing.functionality.filter((item) => item.id !== "size_selection"),
  assets: [
    ...commonAssets,
    asset("product_photos", "Product photos", "Use each file for the matching product only.", "required", ["product", "catalog"], ["PHOTO"]),
  ],
  designNotes: [
    "Prioritise catalogue scanning, clear product cards and product-detail hierarchy.",
    "Never imply stock, delivery times or reviews that were not supplied.",
  ],
  seoFocus: clothing.seoFocus,
};

const restaurant: IndustryProfile = {
  id: "restaurant",
  label: "Restaurant / cafe",
  summary: "A food and hospitality website centred on appetite, the real menu, location and reservations.",
  archetype: "restaurant",
  aliases: ["restaurant", "cafe", "café", "coffee", "bakery", "bistro", "kitchen", "diner", "pizzeria", "ramen", "deli", "eatery", "food", "menu", "cuisine", "chef", "dining", "takeaway", "catering"],
  requiredInformation: [
    ...commonRequired,
    info("menu", "Menu items with names", "required", "Do not invent dishes or menu sections."),
    info("prices", "Menu prices", "required", "Show only supplied prices; otherwise omit them."),
    info("location", "Address or service area", "required", "Do not invent a street address."),
    info("hours", "Opening hours", "required", "Do not invent service times."),
  ],
  recommendedInformation: [
    ...commonRecommended,
    info("reservations", "Reservation method", "recommended"),
    info("menu_descriptions", "Dish descriptions", "recommended"),
    info("dietary", "Dietary and allergen notes", "recommended"),
    info("food_photos", "Food and interior photos", "recommended"),
    info("delivery", "Delivery or takeaway details", "recommended"),
  ],
  optionalInformation: [
    info("chef_story", "Chef or owner story", "optional"),
    info("events", "Events and private dining", "optional"),
    info("social", "Social profiles", "optional"),
  ],
  requiredPages: [
    page("Home", "/", "Showcase the food and drive reservations, orders or visits"),
    page("Menu", "/menu", "Present the real menu with supplied prices"),
    page("About", "/about", "Tell the real story of the kitchen and its people"),
    page("Contact", "/contact", "Location, hours and directions"),
  ],
  recommendedPages: [
    page("Reservations", "/reservations", "Request a table using the client's booking method", "recommended"),
    page("Gallery", "/gallery", "Show real food and room photography", "recommended"),
  ],
  functionality: [
    { id: "menu", label: "Menu with categories and prices", importance: "required" },
    { id: "contact", label: "Contact details and directions", importance: "required" },
    { id: "reservations", label: "Reservation request flow", importance: "recommended" },
    { id: "gallery", label: "Uploaded photo gallery", importance: "recommended" },
    { id: "delivery", label: "Delivery / takeaway information", importance: "optional" },
  ],
  assets: [
    ...commonAssets,
    asset("food_photos", "Food photography", "Use for menu items and appetite-led sections; never as unrelated stock imagery.", "recommended", ["media.gallery", "media.hero"], ["PHOTO"]),
    asset("menu_file", "Menu file", "Extract only information already present in the supplied facts; never invent dishes.", "optional", [], ["MENU"]),
  ],
  designNotes: [
    "Lead with real food photography and a readable menu.",
    "Make location, opening hours and the reservation path easy to find.",
    "Warm, hospitality-led typography and imagery; avoid clinical layouts.",
  ],
  seoFocus: ["cuisine + location supplied by the client", "menu categories", "reservation intent"],
};

const hotel: IndustryProfile = {
  id: "hotel",
  label: "Hotel / hospitality",
  summary: "A stay-focused website where rooms, amenities, real photography and the booking path are central.",
  archetype: "hotel",
  aliases: ["hotel", "resort", "hostel", "guesthouse", "guest house", "lodge", "motel", "inn", "villa stay", "accommodation", "rooms", "stay", "hospitality"],
  requiredInformation: [
    ...commonRequired,
    info("rooms", "Room types and names", "required", "Do not invent room categories."),
    info("room_prices", "Room rates", "required", "Show only supplied rates; otherwise omit pricing."),
    info("location", "Property location", "required", "Do not invent an address or neighbourhood."),
    info("checkin_checkout", "Check-in and check-out times", "required", "Do not invent times."),
    info("booking_method", "Booking or enquiry method", "required", "Use only the client's real booking channel."),
  ],
  recommendedInformation: [
    ...commonRecommended,
    info("amenities", "Amenities and facilities", "recommended"),
    info("room_photos", "Room and property photography", "recommended"),
    info("policies", "House policies", "recommended"),
    info("dining", "Dining and services", "recommended"),
  ],
  optionalInformation: [
    info("reviews", "Verified guest reviews", "optional"),
    info("local_area", "Local area guide", "optional"),
    info("offers", "Offers and packages", "optional"),
  ],
  requiredPages: [
    page("Home", "/", "Introduce the property and drive room enquiries or bookings"),
    page("Rooms", "/rooms", "Compare real room types, amenities and rates"),
    page("Room Detail", "/rooms/room", "Describe one room type with photos and booking CTA"),
    page("Contact", "/contact", "Location, check-in details and enquiries"),
  ],
  recommendedPages: [
    page("Booking", "/booking", "Request or complete a stay booking", "recommended"),
    page("Amenities", "/amenities", "Explain supplied facilities and services", "recommended"),
    page("Gallery", "/gallery", "Show real property and room photography", "recommended"),
    page("About", "/about", "Tell the property's real story", "optional"),
  ],
  functionality: [
    { id: "rooms", label: "Room catalogue with rates and amenities", importance: "required" },
    { id: "booking", label: "Booking or availability enquiry", importance: "required" },
    { id: "gallery", label: "Property photography gallery", importance: "recommended" },
    { id: "amenities", label: "Amenities and services", importance: "recommended" },
    { id: "map", label: "Location and directions", importance: "recommended" },
  ],
  assets: [
    ...commonAssets,
    asset("room_photos", "Room photography", "Use each photo for the matching room type only; never imply a room looks different.", "recommended", ["product", "media.gallery"], ["PHOTO"]),
    asset("property_photos", "Property photography", "Use for hotel, amenities and gallery sections.", "recommended", ["media.gallery", "media.hero"], ["PHOTO"]),
  ],
  designNotes: [
    "Hotel imagery should feel calm and spacious; avoid cramming every amenity into the hero.",
    "Room cards need name, rate (when supplied), capacity/amenities and an honest booking CTA.",
    "Keep check-in details and location easy to find on mobile.",
  ],
  seoFocus: ["property name + location when supplied", "room types", "stay/booking intent"],
};

const portfolio: IndustryProfile = {
  id: "portfolio",
  label: "Portfolio / personal brand",
  summary: "A person-led website where real work, a credible biography and a direct enquiry path matter.",
  archetype: "portfolio",
  aliases: ["portfolio", "personal brand", "freelance", "photographer", "photography", "designer", "artist", "illustrator", "filmmaker", "videographer", "creative work", "resume", "cv", "about me"],
  requiredInformation: [
    ...commonRequired,
    info("bio", "Biography and background", "required", "Do not invent experience, clients or credentials."),
    info("projects", "Project or work names", "required", "Do not invent projects or outcomes."),
    info("project_images", "Project imagery", "required", "Use only uploaded work and honest placeholders."),
    info("skills", "Skills and services", "required"),
  ],
  recommendedInformation: [
    ...commonRecommended,
    info("profile_photo", "Profile photo", "recommended"),
    info("testimonials", "Verified testimonials", "recommended"),
    info("resume", "CV / experience", "recommended"),
    info("social", "Social profiles", "recommended"),
  ],
  optionalInformation: [
    info("awards", "Awards and recognition", "optional"),
    info("press", "Press mentions", "optional"),
    info("availability", "Availability", "optional"),
  ],
  requiredPages: [
    page("Home", "/", "Introduce the person and their best real work"),
    page("Work", "/work", "Show selected projects with supplied context"),
    page("About", "/about", "Present the real biography and approach"),
    page("Contact", "/contact", "Enable project enquiries"),
  ],
  recommendedPages: [
    page("Project Detail", "/work/project", "Explain one project without inventing outcomes", "recommended"),
    page("Services", "/services", "Describe what clients can hire them for", "recommended"),
  ],
  functionality: [
    { id: "work_gallery", label: "Selected work gallery", importance: "required" },
    { id: "project_detail", label: "Project detail pages", importance: "recommended" },
    { id: "contact", label: "Project enquiry form", importance: "required" },
    { id: "social", label: "Social links", importance: "optional" },
  ],
  assets: [
    ...commonAssets,
    asset("work_images", "Work / project images", "Use each image only for the project it depicts; never as generic decoration.", "required", ["media.gallery", "media.hero"], ["PHOTO"]),
    asset("profile_photo", "Profile photo", "Use only as the person's portrait, never as a project image.", "recommended", ["media.people"], ["PHOTO"]),
  ],
  designNotes: [
    "Let the work lead; keep the person's name and practice visible.",
    "Project cards need a clear title and supplied context, not invented client names or results.",
    "Use restrained typography and generous whitespace.",
  ],
  seoFocus: ["person's name + discipline", "project titles", "location when supplied"],
};

const professionalServices: IndustryProfile = {
  id: "professional-services",
  label: "Professional services",
  summary: "A trust-led service website where expertise, service scope, credentials and enquiries matter.",
  archetype: "business",
  aliases: ["professional services", "consulting", "consultancy", "law", "legal", "accounting", "bookkeeping", "financial", "insurance", "real estate", "advisory", "clinic", "therapy", "coaching", "cleaning", "repair", "contractor"],
  requiredInformation: [
    ...commonRequired,
    info("services", "Services and expertise", "required", "Do not invent service lines or specialisms."),
    info("service_area", "Location or service area", "required", "Do not invent coverage."),
    info("credentials", "Relevant credentials or registration", "required", "Only state credentials the client supplied."),
  ],
  recommendedInformation: [
    ...commonRecommended,
    info("team", "Team members", "recommended"),
    info("pricing", "Fees or pricing", "recommended"),
    info("testimonials", "Verified testimonials", "recommended"),
    info("faq", "Answerable FAQs", "recommended"),
    info("booking", "Consultation booking method", "recommended"),
  ],
  optionalInformation: [
    info("case_studies", "Case studies", "optional"),
    info("insurance", "Insurance or coverage notes", "optional"),
    info("resources", "Guides and resources", "optional"),
  ],
  requiredPages: [
    page("Home", "/", "Explain the expertise and drive enquiries"),
    page("Services", "/services", "Detail the real service lines"),
    page("About", "/about", "Build trust with the real firm story"),
    page("Contact", "/contact", "Enquiries, quotes and directions"),
  ],
  recommendedPages: [
    page("Booking", "/booking", "Request a consultation using the client's process", "recommended"),
    page("FAQ", "/faq", "Answer only client-answered questions", "recommended"),
    page("Team", "/team", "Introduce real team members", "recommended"),
  ],
  functionality: [
    { id: "services", label: "Service detail", importance: "required" },
    { id: "contact", label: "Enquiry form", importance: "required" },
    { id: "booking", label: "Consultation request", importance: "recommended" },
    { id: "faq", label: "Answerable FAQs", importance: "recommended" },
    { id: "team", label: "Team profiles", importance: "recommended" },
  ],
  assets: [
    ...commonAssets,
    asset("team_photos", "Team photos", "Use only for the matching named person; never invent staff.", "recommended", ["media.people"], ["PHOTO"]),
    asset("credential_files", "Credential documents", "Use only information already extracted into verified facts.", "optional", [], ["DOCUMENT"]),
  ],
  designNotes: [
    "Lead with clarity and credibility, not hype.",
    "Show the service scope and enquiry path above the fold.",
    "Never imply outcomes, guarantees or credentials that were not supplied.",
  ],
  seoFocus: ["service + location", "expertise", "consultation intent"],
};

const agency: IndustryProfile = {
  id: "agency",
  label: "Creative agency / studio",
  summary: "A studio website where positioning, case studies, services and new-business enquiries matter.",
  archetype: "agency",
  aliases: ["agency", "creative agency", "digital agency", "marketing agency", "advertising agency", "brand agency", "design agency", "pr agency", "studio", "creative studio", "branding", "marketing", "advertising", "design studio", "web design", "public relations", "pr"],
  requiredInformation: [
    ...commonRequired,
    info("positioning", "Agency positioning", "required", "Do not invent a purpose statement that the client did not supply."),
    info("services", "Service lines", "required", "Do not invent capabilities."),
    info("case_studies", "Case studies or project names", "required", "Do not invent clients, results or awards."),
    info("work_images", "Case-study imagery", "required", "Use only uploaded work."),
  ],
  recommendedInformation: [
    ...commonRecommended,
    info("team", "Team members", "recommended"),
    info("process", "Process", "recommended"),
    info("testimonials", "Verified testimonials", "recommended"),
    info("clients", "Client list", "recommended"),
  ],
  optionalInformation: [
    info("awards", "Awards", "optional"),
    info("careers", "Careers", "optional"),
    info("insights", "Insights / writing", "optional"),
  ],
  requiredPages: [
    page("Home", "/", "Position the agency and win project enquiries"),
    page("Work", "/work", "Show real case studies"),
    page("Services", "/services", "Explain real service lines"),
    page("About", "/about", "Introduce the studio and real team"),
    page("Contact", "/contact", "New-business enquiries"),
  ],
  recommendedPages: [
    page("Project Detail", "/work/project", "Explain one case study without inventing outcomes", "recommended"),
    page("Team", "/team", "Introduce real team members", "optional"),
  ],
  functionality: [
    { id: "case_studies", label: "Case-study showcase", importance: "required" },
    { id: "services", label: "Service lines", importance: "required" },
    { id: "contact", label: "New-business enquiry form", importance: "required" },
    { id: "team", label: "Team profiles", importance: "recommended" },
  ],
  assets: [
    ...commonAssets,
    asset("work_images", "Case-study images", "Use each image only for the project it depicts.", "required", ["media.gallery", "media.hero"], ["PHOTO"]),
    asset("team_photos", "Team photos", "Use only for the matching named person.", "recommended", ["media.people"], ["PHOTO"]),
  ],
  designNotes: [
    "Show the work early; make case studies scannable.",
    "Keep positioning specific and grounded in the agency's real services.",
    "Never invent client logos, awards or performance metrics.",
  ],
  seoFocus: ["service + positioning", "case-study topics", "location when supplied"],
};

const saas: IndustryProfile = {
  id: "saas",
  label: "SaaS / software product",
  summary: "A product-led website where the value proposition, features, pricing and sign-up path matter.",
  archetype: "saas",
  aliases: ["saas", "software", "platform", "app", "dashboard", "api", "b2b software", "subscription", "free trial", "product-led", "startup", "tech product"],
  requiredInformation: [
    ...commonRequired,
    info("value_proposition", "Product value proposition", "required", "Do not invent product outcomes."),
    info("features", "Product features", "required", "Do not invent capabilities or integrations."),
    info("target_users", "Target users / use cases", "required"),
    info("signup_path", "Trial, demo or sign-up path", "required", "Use only the client's real conversion path."),
  ],
  recommendedInformation: [
    ...commonRecommended,
    info("pricing", "Pricing plans", "recommended"),
    info("screenshots", "Product screenshots", "recommended"),
    info("faq", "Answerable FAQs", "recommended"),
    info("security", "Security and privacy notes", "recommended"),
    info("docs", "Documentation", "recommended"),
  ],
  optionalInformation: [
    info("testimonials", "Verified customer quotes", "optional"),
    info("integrations", "Integrations", "optional"),
    info("changelog", "Changelog", "optional"),
  ],
  requiredPages: [
    page("Home", "/", "Position the product and drive trial or demo"),
    page("Features", "/features", "Explain what the product actually does"),
    page("Pricing", "/pricing", "Present supplied plans and prices"),
    page("Contact", "/contact", "Sales and support enquiries"),
  ],
  recommendedPages: [
    page("About", "/about", "Introduce the company behind the product", "recommended"),
    page("FAQ", "/faq", "Answer only client-answered questions", "recommended"),
    page("Docs", "/docs", "Explain supplied documentation", "optional"),
  ],
  functionality: [
    { id: "features", label: "Feature detail", importance: "required" },
    { id: "pricing", label: "Pricing comparison", importance: "recommended" },
    { id: "signup", label: "Trial / demo / sign-up CTA", importance: "required" },
    { id: "faq", label: "Answerable FAQs", importance: "recommended" },
    { id: "search", label: "Documentation search", importance: "optional" },
  ],
  assets: [
    ...commonAssets,
    asset("product_screenshots", "Product screenshots", "Use only real product UI; never fabricate a dashboard.", "recommended", ["product", "media.gallery"], ["PHOTO"]),
    asset("integration_logos", "Integration logos", "Use only integrations the client supplied.", "optional", ["brand.logo"], ["LOGO"]),
  ],
  designNotes: [
    "Explain the product in plain language before listing features.",
    "Show real UI screenshots where supplied; do not invent a product interface.",
    "Pricing must be omitted or marked as unavailable when no real prices were supplied.",
  ],
  seoFocus: ["product category + use case", "feature terms", "alternative/comparison intent only when supported"],
};

const generic: IndustryProfile = {
  id: "generic",
  label: "General business",
  summary: "A clear, credible business website built from the client's real services and contact details.",
  archetype: "business",
  aliases: ["business", "company", "services", "local business", "other"],
  requiredInformation: [
    ...commonRequired,
    info("offerings", "Offerings or services", "required", "Do not invent services."),
  ],
  recommendedInformation: [
    ...commonRecommended,
    info("about", "About the business", "recommended"),
    info("testimonials", "Verified testimonials", "recommended"),
    info("faq", "Answerable FAQs", "recommended"),
    info("team", "Team members", "recommended"),
  ],
  optionalInformation: [
    info("pricing", "Pricing", "optional"),
    info("blog", "Articles", "optional"),
    info("careers", "Careers", "optional"),
  ],
  requiredPages: [
    page("Home", "/", "Introduce the business and drive the primary enquiry"),
    page("Services", "/services", "Detail the real services on offer"),
    page("About", "/about", "Build trust with the real business story"),
    page("Contact", "/contact", "Enquiries and directions"),
  ],
  recommendedPages: [
    page("FAQ", "/faq", "Answer only client-answered questions", "recommended"),
    page("Team", "/team", "Introduce real team members", "optional"),
  ],
  functionality: [
    { id: "services", label: "Service detail", importance: "required" },
    { id: "contact", label: "Enquiry form", importance: "required" },
    { id: "faq", label: "Answerable FAQs", importance: "recommended" },
  ],
  assets: commonAssets,
  designNotes: [
    "Prioritise clarity, legibility and a direct enquiry path.",
    "Do not invent a founding story, statistics, clients or guarantees.",
  ],
  seoFocus: ["business name + service", "location when supplied", "enquiry intent"],
};

export const INDUSTRY_PROFILES: Record<IndustryProfileId, IndustryProfile> = {
  clothing,
  ecommerce,
  restaurant,
  hotel,
  portfolio,
  "professional-services": professionalServices,
  agency,
  saas,
  generic,
};

export interface IndustryResolveInput {
  websiteType?: string;
  industry?: string;
  archetype?: string;
  productSummary?: string;
  description?: string;
  offerings?: string[];
  requiredPages?: string[];
  features?: Record<string, boolean>;
}

export interface IndustryProfileResolution {
  profile: IndustryProfile;
  confidence: "explicit" | "keyword" | "fallback";
  reasons: string[];
  matchedKeywords: string[];
}

function normalize(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-phrase matching keeps "wear" out of "software" and "app" out of "appointment". */
function aliasPattern(alias: string): RegExp {
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegex(alias)}(?:$|[^a-z0-9])`, "i");
}

function containsAlias(text: string, alias: string): boolean {
  return aliasPattern(alias).test(text);
}

function profileScore(profile: IndustryProfile, text: string): { score: number; matched: string[] } {
  const matched: string[] = [];
  let score = 0;
  for (const alias of profile.aliases) {
    if (!alias) continue;
    if (containsAlias(text, alias)) {
      matched.push(alias);
      score += alias.includes(" ") ? 3 : 1;
    }
  }
  return { score, matched };
}

const ARCHETYPE_TO_PROFILE: Record<string, IndustryProfileId> = {
  ecommerce: "ecommerce",
  restaurant: "restaurant",
  hotel: "hotel",
  portfolio: "portfolio",
  personal: "portfolio",
  agency: "agency",
  saas: "saas",
  business: "professional-services",
  healthcare: "professional-services",
  education: "professional-services",
  booking: "professional-services",
  realestate: "professional-services",
  event: "professional-services",
  nonprofit: "professional-services",
  community: "generic",
  blog: "portfolio",
  marketplace: "ecommerce",
  landing: "generic",
  custom: "generic",
};

/**
 * Resolves the most specific profile from explicit industry/archetype signals
 * and the client's own words. Clothing is checked before generic ecommerce so a
 * fashion store gets size/colour requirements; generic words never override an
 * explicit industry.
 */
export function resolveIndustryProfile(input: IndustryResolveInput): IndustryProfileResolution {
  const explicitIndustry = normalize(input.industry);
  const text = [
    input.industry,
    input.productSummary,
    input.description,
    ...(input.offerings ?? []),
    input.websiteType,
    input.archetype,
    ...(input.requiredPages ?? []),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  if (explicitIndustry) {
    // The most specific explicit alias wins: "creative agency" must resolve to
    // the agency profile, not the broader professional-services profile.
    const matches = Object.values(INDUSTRY_PROFILES)
      .map((profile) => {
        const matched = profile.aliases.filter((alias) => containsAlias(explicitIndustry, alias));
        const score = matched.reduce(
          (best, alias) => Math.max(best, (explicitIndustry === alias ? 1000 : 0) + alias.length),
          0,
        );
        return { profile, matched, score };
      })
      .filter((entry) => entry.matched.length > 0)
      .sort((a, b) => b.score - a.score);
    const explicitClothing = matches.find((entry) => entry.profile.id === "clothing");
    const explicitWinner =
      explicitClothing && matches[0]?.profile.id === "ecommerce" ? explicitClothing : matches[0];
    if (explicitWinner) {
      return {
        profile: explicitWinner.profile,
        confidence: "explicit",
        reasons: [`industry explicitly states "${input.industry}"`],
        matchedKeywords: explicitWinner.matched,
      };
    }
  }

  const archetype = normalize(input.archetype);
  const websiteType = normalize(input.websiteType);
  const explicitProfileId = ARCHETYPE_TO_PROFILE[archetype] ?? ARCHETYPE_TO_PROFILE[websiteType];
  const explicitReasons: string[] = [];
  if (archetype) explicitReasons.push(`archetype is "${archetype}"`);
  if (websiteType) explicitReasons.push(`website type is "${websiteType}"`);

  const scored = Object.values(INDUSTRY_PROFILES)
    .filter((profile) => profile.id !== "generic")
    .map((profile) => ({ profile, ...profileScore(profile, text) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const runnerUp = scored[1];

  // Clothing must beat generic ecommerce when garment terms are present.
  const clothingMatch = scored.find((entry) => entry.profile.id === "clothing");
  if (clothingMatch && clothingMatch.matched.length > 0 && (best?.profile.id === "ecommerce" || !best)) {
    return {
      profile: clothingMatch.profile,
      confidence: "keyword",
      reasons: ["clothing-specific terms were found in the project description"],
      matchedKeywords: clothingMatch.matched,
    };
  }

  // An explicit structural archetype is authoritative. It is only refined
  // where the profile is genuinely a subset: clothing is more specific than
  // generic ecommerce (sizes, colours, fit).
  if (explicitProfileId && explicitProfileId !== "generic") {
    if (explicitProfileId === "ecommerce" && clothingMatch && clothingMatch.matched.length > 0) {
      return {
        profile: clothingMatch.profile,
        confidence: "explicit",
        reasons: [...explicitReasons, "garment terms make clothing the more specific ecommerce profile"],
        matchedKeywords: clothingMatch.matched,
      };
    }
    return {
      profile: INDUSTRY_PROFILES[explicitProfileId],
      confidence: "explicit",
      reasons: explicitReasons,
      matchedKeywords: profileScore(INDUSTRY_PROFILES[explicitProfileId], text).matched,
    };
  }

  if (best && best.score >= 2 && (!runnerUp || best.score > runnerUp.score)) {
    return {
      profile: best.profile,
      confidence: "keyword",
      reasons: ["matched industry keywords in the client's description"],
      matchedKeywords: best.matched,
    };
  }

  return {
    profile: INDUSTRY_PROFILES.generic,
    confidence: "fallback",
    reasons: ["no specific industry signal was present"],
    matchedKeywords: [],
  };
}

export interface IndustryAssetInput {
  filename: string;
  kind?: string;
  category?: string;
}

export interface IndustryGapContext {
  assets?: IndustryAssetInput[];
  pages?: Array<{ name: string; path: string }>;
  extraFacts?: string[];
  /** The already-classified archetype wins over raw website type. */
  archetype?: string;
}

export interface IndustryGapAnalysis {
  profile: IndustryProfile;
  confidence: IndustryProfileResolution["confidence"];
  reasons: string[];
  matchedKeywords: string[];
  missingRequiredInformation: IndustryInfoRequirement[];
  missingRecommendedInformation: IndustryInfoRequirement[];
  missingRequiredPages: IndustryPageRequirement[];
  missingRecommendedPages: IndustryPageRequirement[];
  missingAssets: IndustryAssetRequirement[];
  expectedPages: IndustryPageRequirement[];
  expectedFunctionality: string[];
  providedInformation: IndustryInfoRequirement[];
}

function pagePresent(requirement: IndustryPageRequirement, pages: Array<{ name: string; path: string }>): boolean {
  const wantedName = requirement.name.toLowerCase();
  const wantedPath = requirement.path.toLowerCase();
  return pages.some((page) => {
    const name = page.name.toLowerCase();
    const path = page.path.toLowerCase();
    return name === wantedName || path === wantedPath;
  });
}

function assetSatisfies(requirement: IndustryAssetRequirement, assets: IndustryAssetInput[], facts: string): boolean {
  if (requirement.id === "product_photos" || requirement.id === "room_photos") {
    const productAsset = assets.some((item) => {
      const category = (item.category ?? "").toLowerCase();
      return (
        category.includes("product") ||
        category.includes("catalog") ||
        /product|item|room|suite/i.test(item.filename.toLowerCase())
      );
    });
    if (productAsset) return true;
  }
  for (const item of assets) {
    const kind = (item.kind ?? "").toUpperCase();
    const category = (item.category ?? "").toLowerCase();
    const filename = item.filename.toLowerCase();
    if (requirement.kinds?.some((wanted) => wanted.toUpperCase() === kind)) return true;
    if (requirement.categories?.some((wanted) => category === wanted || category.startsWith(`${wanted}.`))) return true;
    if (requirement.id === "logo" && /logo|wordmark|brandmark/.test(filename)) return true;
    if (requirement.id === "profile_photo" && /profile|portrait|headshot/.test(filename)) return true;
    if (requirement.id === "team_photos" && /team|people|staff/.test(filename)) return true;
    if (requirement.id === "menu_file" && /menu/.test(filename)) return true;
  }
  if (requirement.id === "shipping_returns" && /shipping|returns|refund/.test(facts)) return true;
  return false;
}

function hasInfo(id: string, requirements: Requirements, assets: IndustryAssetInput[], facts: string): boolean {
  const business = requirements.business;
  const content = requirements.content;
  const products = [...requirements.ecommerce.products, ...content.products];
  const services = content.services;
  const allItems = [...products, ...services];
  const anyPrice = allItems.some((item) => hasValue(item.price));
  const anyProduct = products.some((item) => hasValue(item.name));
  const anyService = services.some((item) => hasValue(item.name)) || business.offerings.length > 0;
  const anyAsset = assets.length > 0;
  const contact = content.contact;

  switch (id) {
    case "brand_name":
      return hasValue(business.name) || hasValue(requirements.branding.brandName);
    case "description":
      return hasValue(business.description) || hasValue(business.productSummary);
    case "target_audience":
    case "target_users":
      return hasValue(business.targetAudience);
    case "contact_details":
      return hasValue(contact.email) || hasValue(contact.phone);
    case "location":
    case "service_area":
      return hasValue(business.location) || hasValue(contact.address);
    case "hours":
      return hasValue(contact.hours) || /hours|open|closed/.test(facts);
    case "logo":
      return assets.some((item) => (item.kind ?? "").toUpperCase() === "LOGO" || /logo/.test(item.filename));
    case "hero_photo":
      return assets.some((item) => (item.category ?? "").startsWith("media.hero"));
    case "brand_colors":
      return hasValue(requirements.branding.primaryColor) || hasValue(requirements.branding.style);
    case "products":
      return anyProduct || business.offerings.length > 0;
    case "prices":
    case "menu_prices":
    case "room_prices":
    case "pricing":
      return anyPrice || /price|pricing|rate|fee|cost/.test(facts);
    case "sizes":
      return products.some((item) => item.sizes.length > 0) || /\bsizes?\b/.test(facts);
    case "colors":
      return products.some((item) => item.colors.length > 0) || /\bcolou?rs?\b/.test(facts);
    case "variants":
      return products.some((item) => item.variants.length > 0) || /\bvariants?\b/.test(facts);
    case "product_images":
      return (
        products.some((item) => hasValue(item.imageUrl)) ||
        assets.some((item) => /product|item/i.test(item.filename) || /product/i.test(item.category ?? ""))
      );
    case "shipping_returns":
      return (
        hasValue(requirements.ecommerce.shipping.notes) ||
        requirements.ecommerce.shipping.regions.length > 0 ||
        /shipping|delivery|returns?|refunds?/.test(facts)
      );
    case "categories":
      return products.some((item) => hasValue(item.category)) || /\bcategor(y|ies)\b/.test(facts);
    case "materials_fit":
      return /material|fabric|fit|care/.test(facts);
    case "brand_story":
    case "bio":
    case "about":
      return hasValue(content.about) || hasValue(business.description);
    case "faq":
    case "menu":
      return content.faq.length > 0 || anyService || anyProduct || /menu|dish|faq/.test(facts);
    case "menu_descriptions":
      return allItems.some((item) => hasValue(item.description));
    case "dietary":
      return /vegan|vegetarian|gluten|allerg|dietary/.test(facts);
    case "room_photos":
    case "property_photos":
      return products.some((item) => hasValue(item.imageUrl)) || anyAsset || /photo|image|screenshot/.test(facts);
    case "food_photos":
    case "work_images":
    case "project_images":
    case "photo_images":
    case "team_photos":
    case "profile_photo":
    case "product_screenshots":
      return anyAsset || /photo|image|screenshot/.test(facts);
    case "reservations":
    case "booking":
    case "booking_method":
    case "signup_path":
      return (
        requirements.features.booking ||
        /reserv|book|appointment|schedule|sign.?up|trial|demo/.test(facts) ||
        /reserv|book|appointment|schedule|signup|demo/i.test(requirements.website.conversionAction)
      );
    case "checkin_checkout":
      return /check.?in|check.?out/.test(facts);
    case "rooms":
      return products.some((item) => /room|suite|villa|stay/i.test(`${item.name} ${item.category}`)) || /room|suite/.test(facts);
    case "amenities":
      return /amenit|facilit|pool|wifi|spa|gym/.test(facts);
    case "policies":
    case "credentials":
      return /polic|licen[cs]e|regist|credential|certif/.test(facts) || hasValue(business.valueProposition);
    case "projects":
    case "case_studies":
      return anyService || business.offerings.length > 0 || /project|case stud|work/.test(facts) || assets.length > 0;
    case "skills":
    case "services":
    case "positioning":
    case "features":
      return anyService || hasValue(business.valueProposition) || /service|feature|skill|expert/.test(facts);
    case "value_proposition":
      return hasValue(business.valueProposition) || hasValue(business.productSummary);
    case "team":
      return content.team.length > 0 || /team|staff|founder/.test(facts);
    case "testimonials":
    case "reviews":
      return content.testimonials.length > 0 || /review|testimonial/.test(facts);
    case "social":
      return Object.values(content.socials).some((value) => hasValue(value));
    case "offering":
    case "offerings":
      return anyService || anyProduct;
    case "sku":
      return /sku|stock|inventory/.test(facts);
    default:
      // Unknown requirement ids are treated as missing, not silently satisfied.
      return false;
  }
}

/**
 * Compares one project's requirements, assets and page plan with its industry
 * profile. The result is deliberately explicit: missing required information
 * must reach the prompt so the model can write around it without inventing it.
 */
export function analyzeIndustryGaps(
  requirements: Requirements,
  context: IndustryGapContext = {},
): IndustryGapAnalysis {
  const resolution = resolveIndustryProfile({
    websiteType: requirements.website.type,
    industry: requirements.business.industry,
    archetype: context.archetype ?? requirements.website.archetype,
    productSummary: requirements.business.productSummary,
    description: requirements.business.description,
    offerings: requirements.business.offerings,
    requiredPages: requirements.website.requiredPages,
    features: requirements.features as unknown as Record<string, boolean>,
  });
  const profile = resolution.profile;
  const assets = context.assets ?? [];
  const facts = [
    ...(context.extraFacts ?? []),
    requirements.business.description,
    requirements.business.productSummary,
    requirements.business.offerings.join(" "),
    requirements.business.uniqueSellingPoints.join(" "),
    requirements.content.about,
    requirements.website.purpose,
    requirements.website.changeRequests.join(" "),
  ]
    .join("\n")
    .toLowerCase();
  const pages =
    context.pages ??
    (requirements.website.pagePlan.length > 0
      ? requirements.website.pagePlan
      : requirements.website.requiredPages.map((name) => ({
          name,
          path: `/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page"}`,
        })));
  const providedInformation = [...profile.requiredInformation, ...profile.recommendedInformation, ...profile.optionalInformation].filter(
    (requirement) => hasInfo(requirement.id, requirements, assets, facts),
  );
  const missingRequiredInformation = profile.requiredInformation.filter(
    (requirement) => !providedInformation.includes(requirement),
  );
  const missingRecommendedInformation = profile.recommendedInformation.filter(
    (requirement) => !providedInformation.includes(requirement),
  );

  return {
    profile,
    confidence: resolution.confidence,
    reasons: resolution.reasons,
    matchedKeywords: resolution.matchedKeywords,
    missingRequiredInformation,
    missingRecommendedInformation,
    missingRequiredPages: profile.requiredPages.filter((requirement) => !pagePresent(requirement, pages)),
    missingRecommendedPages: profile.recommendedPages.filter((requirement) => !pagePresent(requirement, pages)),
    missingAssets: profile.assets.filter((requirement) => !assetSatisfies(requirement, assets, facts)),
    expectedPages: [...profile.requiredPages, ...profile.recommendedPages],
    expectedFunctionality: profile.functionality.map((item) => item.label),
    providedInformation,
  };
}
