/**
 * Domain enums shared by the API, the AI layer and the web client.
 *
 * The database stores these as plain strings (portable across Postgres/SQLite
 * and safe for AI-generated payloads), so the unions below are the single
 * source of truth and every boundary validates against them with Zod.
 */

export const WEBSITE_TYPES = [
  "business",
  "portfolio",
  "ecommerce",
  "saas",
  "blog",
  "landing",
  "restaurant",
  "agency",
  "personal",
  "other",
] as const;
export type WebsiteType = (typeof WEBSITE_TYPES)[number];

export const WEBSITE_TYPE_LABELS: Record<WebsiteType, string> = {
  business: "Business website",
  portfolio: "Portfolio",
  ecommerce: "E-commerce",
  saas: "SaaS",
  blog: "Blog",
  landing: "Landing page",
  restaurant: "Restaurant",
  agency: "Agency",
  personal: "Personal website",
  other: "Other",
};

export const WEBSITE_TYPE_HINTS: Record<WebsiteType, string> = {
  business: "Service business, local company or consultancy",
  portfolio: "Showcase of creative or professional work",
  ecommerce: "Sell physical or digital products online",
  saas: "Software product with pricing and sign-up",
  blog: "Editorial content and articles",
  landing: "Single-purpose conversion page",
  restaurant: "Menu, reservations and location",
  agency: "Studio/agency with services and case studies",
  personal: "Personal brand, CV and writing",
  other: "Something else entirely",
};

export const PROJECT_STATUSES = [
  "DISCOVERY",
  "REQUIREMENTS_READY",
  "GENERATING",
  "DRAFT",
  "PUBLISHED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  DISCOVERY: "Discovery",
  REQUIREMENTS_READY: "Requirements ready",
  GENERATING: "Generating",
  DRAFT: "Draft",
  PUBLISHED: "Published",
};

export const MESSAGE_ROLES = ["user", "assistant", "system", "generation"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const COMPLETENESS_CATEGORIES = [
  "business",
  "branding",
  "pages",
  "content",
  "features",
  "ecommerce",
  "technical",
  "seo",
] as const;
export type CompletenessCategory = (typeof COMPLETENESS_CATEGORIES)[number];

export const COMPLETENESS_LABELS: Record<CompletenessCategory, string> = {
  business: "Business",
  branding: "Branding",
  pages: "Pages",
  content: "Content",
  features: "Features",
  ecommerce: "E-commerce",
  technical: "Technical",
  seo: "SEO",
};

/** Controlled component library - the only section types the renderer accepts. */
export const SECTION_TYPES = [
  "Navbar",
  "Hero",
  "Features",
  "About",
  "Services",
  "Products",
  "ProductGrid",
  "ProductCard",
  "Pricing",
  "Testimonials",
  "FAQ",
  "Gallery",
  "Contact",
  "CTA",
  "Footer",
  "Blog",
  "Team",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const VERSION_SOURCES = [
  "generation",
  "modification",
  "restore",
  "template",
  "seed",
] as const;
export type VersionSource = (typeof VERSION_SOURCES)[number];

export const DEPLOYMENT_STATUSES = ["PENDING", "BUILDING", "READY", "FAILED"] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const HOSTING_PROVIDERS = ["local", "vercel", "netlify", "cloudflare"] as const;
export type HostingProvider = (typeof HOSTING_PROVIDERS)[number];

export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const ORDER_STATUSES = ["PENDING", "PAID", "FULFILLED", "CANCELLED", "REFUNDED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const DOMAIN_STATUSES = ["PENDING", "VERIFIED", "ERROR"] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

export const ACTIVITY_TYPES = [
  "project_created",
  "requirements_updated",
  "specification_generated",
  "website_generated",
  "website_modified",
  "version_restored",
  "published",
  "export",
  "template_applied",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Design language presets offered by the AI planner and the inspector. */
export const DESIGN_STYLES = [
  "modern",
  "premium",
  "minimal",
  "bold",
  "warm",
  "editorial",
  "playful",
  "corporate",
  "luxury",
  "retro",
] as const;
export type DesignStyle = (typeof DESIGN_STYLES)[number];

export const FONT_PAIRINGS = [
  "Inter + Inter",
  "Playfair Display + Inter",
  "Sora + Inter",
  "Space Grotesk + Inter",
  "DM Serif Display + DM Sans",
  "Poppins + Inter",
  "Libre Baskerville + Source Sans",
] as const;
export type FontPairing = (typeof FONT_PAIRINGS)[number];
