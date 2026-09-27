import { z } from "zod";
import { SECTION_TYPES, type SectionType } from "./enums";

/**
 * The controlled component library's prop contracts.
 *
 * The AI never writes JSX or JavaScript: it composes *these* section types with
 * validated props, which is what makes the preview/publish pipeline safe. Any
 * unknown `type` or invalid prop fails Zod validation instead of reaching the
 * renderer, so no AI-authored code can ever execute.
 */

const text = z.string().default("");
const textList = z.array(z.string()).default([]);

export const LinkSchema = z.object({
  label: z.string().min(1),
  path: z.string().default("/"),
  external: z.boolean().default(false),
});
export type Link = z.infer<typeof LinkSchema>;

export const ImageSchema = z.object({
  url: text,
  alt: text,
  caption: text,
});
export type Image = z.infer<typeof ImageSchema>;

export const ProductEntrySchema = z.object({
  id: text,
  name: z.string().min(1),
  description: text,
  priceCents: z.number().int().nonnegative().default(0),
  currency: z.string().default("USD"),
  imageUrl: text,
  category: text,
  badge: text,
  href: text,
});
export type ProductEntry = z.infer<typeof ProductEntrySchema>;

export const NavbarSectionSchema = z.object({
  type: z.literal("Navbar"),
  logoText: text,
  logoImageUrl: text,
  links: z.array(LinkSchema).default([]),
  cta: z
    .object({ label: text, path: text })
    .optional(),
  style: z.enum(["solid", "transparent", "bordered"]).default("solid"),
  sticky: z.boolean().default(true),
});

export const HeroSectionSchema = z.object({
  type: z.literal("Hero"),
  eyebrow: text,
  title: z.string().min(1),
  subtitle: text,
  primaryCta: LinkSchema.partial({ label: true, external: true }).optional(),
  secondaryCta: LinkSchema.partial({ label: true, external: true }).optional(),
  image: ImageSchema.optional(),
  align: z.enum(["left", "center"]).default("left"),
  size: z.enum(["compact", "standard", "tall"]).default("standard"),
  backgroundImageUrl: text,
  overlayOpacity: z.number().min(0).max(0.9).default(0.45),
  trustLine: text,
  stats: z.array(z.object({ value: z.string(), label: z.string() })).max(4).default([]),
});

export const FeaturesSectionSchema = z.object({
  type: z.literal("Features"),
  eyebrow: text,
  title: text,
  subtitle: text,
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  items: z
    .array(
      z.object({
        icon: text,
        title: z.string().min(1),
        description: text,
      }),
    )
    .max(8)
    .default([]),
});

export const AboutSectionSchema = z.object({
  type: z.literal("About"),
  eyebrow: text,
  title: text,
  body: textList,
  image: ImageSchema.optional(),
  imagePosition: z.enum(["left", "right"]).default("right"),
  stats: z.array(z.object({ value: z.string(), label: z.string() })).max(4).default([]),
  highlights: textList,
  signature: text,
});

export const ServicesSectionSchema = z.object({
  type: z.literal("Services"),
  eyebrow: text,
  title: text,
  subtitle: text,
  layout: z.enum(["grid", "list"]).default("grid"),
  columns: z.union([z.literal(2), z.literal(3)]).default(3),
  items: z
    .array(
      z.object({
        title: z.string().min(1),
        description: text,
        price: text,
        duration: text,
        bulletPoints: textList,
      }),
    )
    .max(12)
    .default([]),
});

export const ProductsSectionSchema = z.object({
  type: z.literal("Products"),
  eyebrow: text,
  title: text,
  subtitle: text,
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  showPrices: z.boolean().default(true),
  cta: z.object({ label: text, path: text }).optional(),
  items: z.array(ProductEntrySchema).max(24).default([]),
});

export const ProductGridSectionSchema = z.object({
  type: z.literal("ProductGrid"),
  eyebrow: text,
  title: text,
  subtitle: text,
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  categories: textList,
  items: z.array(ProductEntrySchema).max(36).default([]),
});

export const ProductCardSectionSchema = z.object({
  type: z.literal("ProductCard"),
  title: text,
  product: ProductEntrySchema,
});

export const PricingSectionSchema = z.object({
  type: z.literal("Pricing"),
  eyebrow: text,
  title: text,
  subtitle: text,
  currency: z.string().default("USD"),
  note: text,
  plans: z
    .array(
      z.object({
        name: z.string().min(1),
        price: z.string().default("0"),
        period: text,
        description: text,
        features: textList,
        cta: z.object({ label: text, path: text }),
        highlighted: z.boolean().default(false),
      }),
    )
    .max(5)
    .default([]),
});

export const TestimonialsSectionSchema = z.object({
  type: z.literal("Testimonials"),
  eyebrow: text,
  title: text,
  layout: z.enum(["grid", "carousel"]).default("grid"),
  items: z
    .array(
      z.object({
        quote: z.string().min(1),
        author: z.string().default(""),
        role: text,
        rating: z.number().min(0).max(5).default(5),
      }),
    )
    .max(9)
    .default([]),
});

export const FaqSectionSchema = z.object({
  type: z.literal("FAQ"),
  eyebrow: text,
  title: text,
  subtitle: text,
  items: z
    .array(z.object({ question: z.string().min(1), answer: text }))
    .max(14)
    .default([]),
});

export const GallerySectionSchema = z.object({
  type: z.literal("Gallery"),
  eyebrow: text,
  title: text,
  subtitle: text,
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  images: z.array(ImageSchema).max(24).default([]),
});

export const ContactSectionSchema = z.object({
  type: z.literal("Contact"),
  eyebrow: text,
  title: text,
  subtitle: text,
  email: text,
  phone: text,
  address: text,
  hours: text,
  whatsapp: text,
  mapEmbedUrl: text,
  showForm: z.boolean().default(true),
  formFields: z.array(z.enum(["name", "email", "phone", "company", "message", "date"])).default(["name", "email", "message"]),
  formAction: z.enum(["none", "mailto", "whatsapp", "booking"]).default("mailto"),
  submitLabel: text,
  successMessage: text,
  socials: z.array(LinkSchema).default([]),
});

export const CtaSectionSchema = z.object({
  type: z.literal("CTA"),
  eyebrow: text,
  title: z.string().min(1),
  body: text,
  button: LinkSchema.partial({ label: true, external: true }).optional(),
  secondaryButton: LinkSchema.partial({ label: true, external: true }).optional(),
  variant: z.enum(["solid", "accent", "outline"]).default("solid"),
  note: text,
});

export const FooterSectionSchema = z.object({
  type: z.literal("Footer"),
  logoText: text,
  tagline: text,
  columns: z
    .array(z.object({ title: z.string().default(""), links: z.array(LinkSchema).default([]) }))
    .max(4)
    .default([]),
  socials: z.array(LinkSchema).default([]),
  contactEmail: text,
  contactPhone: text,
  address: text,
  newsletter: z.boolean().default(false),
  newsletterNote: text,
  copyright: text,
  legalLinks: z.array(LinkSchema).default([]),
});

export const BlogSectionSchema = z.object({
  type: z.literal("Blog"),
  eyebrow: text,
  title: text,
  subtitle: text,
  layout: z.enum(["grid", "list"]).default("grid"),
  posts: z
    .array(
      z.object({
        title: z.string().min(1),
        excerpt: text,
        date: text,
        author: text,
        category: text,
        imageUrl: text,
        url: text,
        readingTime: text,
      }),
    )
    .max(12)
    .default([]),
});

export const TeamSectionSchema = z.object({
  type: z.literal("Team"),
  eyebrow: text,
  title: text,
  subtitle: text,
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  members: z
    .array(
      z.object({
        name: z.string().min(1),
        role: text,
        bio: text,
        imageUrl: text,
        socialLinks: z.array(LinkSchema).default([]),
      }),
    )
    .max(12)
    .default([]),
});

/**
 * A section is `{ id, type, props }`. `props` carries the discriminated
 * `type` literal as well so the union stays exhaustively checkable.
 */
const baseFields = {
  id: z.string().min(1),
  visible: z.boolean().default(true),
};

export const SectionSchema = z.discriminatedUnion("type", [
  NavbarSectionSchema.extend(baseFields),
  HeroSectionSchema.extend(baseFields),
  FeaturesSectionSchema.extend(baseFields),
  AboutSectionSchema.extend(baseFields),
  ServicesSectionSchema.extend(baseFields),
  ProductsSectionSchema.extend(baseFields),
  ProductGridSectionSchema.extend(baseFields),
  ProductCardSectionSchema.extend(baseFields),
  PricingSectionSchema.extend(baseFields),
  TestimonialsSectionSchema.extend(baseFields),
  FaqSectionSchema.extend(baseFields),
  GallerySectionSchema.extend(baseFields),
  ContactSectionSchema.extend(baseFields),
  CtaSectionSchema.extend(baseFields),
  FooterSectionSchema.extend(baseFields),
  BlogSectionSchema.extend(baseFields),
  TeamSectionSchema.extend(baseFields),
]);
export type Section = z.infer<typeof SectionSchema>;

/** Section props without the base fields - what the renderer components receive. */
export type SectionProps<T extends SectionType> = Omit<
  Extract<Section, { type: T }>,
  "id" | "visible" | "type"
>;

/** Per-type schema registry, used for partial patches coming from the AI/modifier. */
export const SECTION_PROP_SCHEMAS = {
  Navbar: NavbarSectionSchema,
  Hero: HeroSectionSchema,
  Features: FeaturesSectionSchema,
  About: AboutSectionSchema,
  Services: ServicesSectionSchema,
  Products: ProductsSectionSchema,
  ProductGrid: ProductGridSectionSchema,
  ProductCard: ProductCardSectionSchema,
  Pricing: PricingSectionSchema,
  Testimonials: TestimonialsSectionSchema,
  FAQ: FaqSectionSchema,
  Gallery: GallerySectionSchema,
  Contact: ContactSectionSchema,
  CTA: CtaSectionSchema,
  Footer: FooterSectionSchema,
  Blog: BlogSectionSchema,
  Team: TeamSectionSchema,
} satisfies Record<SectionType, z.ZodTypeAny>;

export function isSectionType(value: unknown): value is SectionType {
  return typeof value === "string" && (SECTION_TYPES as readonly string[]).includes(value);
}

/** Validates props for one section type; returns a readable error string on failure. */
export function validateSectionProps(type: SectionType, props: unknown): { ok: true; data: unknown } | { ok: false; error: string } {
  const schema = SECTION_PROP_SCHEMAS[type];
  const parsed = schema.safeParse(props);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((issue) => `${issue.path.join(".") || "props"}: ${issue.message}`).join("; "),
    };
  }
  return { ok: true, data: parsed.data };
}

export function emptySectionProps(type: SectionType): Record<string, unknown> {
  const parsed = SECTION_PROP_SCHEMAS[type].safeParse({ type });
  return parsed.success ? (parsed.data as Record<string, unknown>) : { type };
}

/**
 * Small catalogue that helps the AI choose sensible sections and the UI show
 * friendly names/descriptions in the inspector.
 */
export const SECTION_CATALOG: Record<SectionType, { label: string; description: string; group: "structure" | "content" | "commerce" | "conversion" }> = {
  Navbar: { label: "Navbar", description: "Sticky site header with navigation and call to action", group: "structure" },
  Hero: { label: "Hero", description: "Above-the-fold headline, supporting copy and primary CTA", group: "conversion" },
  Features: { label: "Features", description: "Feature or benefit grid with icons", group: "content" },
  About: { label: "About", description: "Story, differentiators and proof points", group: "content" },
  Services: { label: "Services", description: "Service or menu list with pricing options", group: "content" },
  Products: { label: "Products", description: "Product listing with prices and categories", group: "commerce" },
  ProductGrid: { label: "Product grid", description: "Filterable product grid with category chips", group: "commerce" },
  ProductCard: { label: "Product card", description: "Single product spotlight card", group: "commerce" },
  Pricing: { label: "Pricing", description: "Plan comparison table", group: "commerce" },
  Testimonials: { label: "Testimonials", description: "Customer quotes and ratings", group: "conversion" },
  FAQ: { label: "FAQ", description: "Accordion of common questions", group: "content" },
  Gallery: { label: "Gallery", description: "Image gallery for work, rooms, dishes or products", group: "content" },
  Contact: { label: "Contact", description: "Contact details plus form / booking / WhatsApp", group: "conversion" },
  CTA: { label: "Call to action", description: "Conversion band with a single action", group: "conversion" },
  Footer: { label: "Footer", description: "Site footer with sitemap, socials and legal links", group: "structure" },
  Blog: { label: "Blog", description: "Article list for content marketing", group: "content" },
  Team: { label: "Team", description: "People grid for agencies and studios", group: "content" },
};



