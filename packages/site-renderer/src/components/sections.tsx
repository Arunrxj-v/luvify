import type { Section, SectionProps } from "@luvify/shared";
import { NavbarSection, FooterSection } from "./structure";
import { HeroSection, FeaturesSection } from "./hero";
import { AboutSection, FaqSection, GallerySection, ServicesSection } from "./content";
import { BlogSection, TeamSection, TestimonialsSection } from "./editorial";
import { PricingSection, ProductCardSection, ProductGridSection, ProductsSection } from "./commerce";
import { ContactSection, CtaSection } from "./convert";

/** Compile-time guard: a new `SectionType` without a case fails to build. */
function assertNever(value: never): never {
  throw new Error(`Unhandled section type: ${JSON.stringify(value)}`);
}

/**
 * Renders one validated section. Props are the Zod-inferred `SectionProps<T>`, so
 * the only thing an AI can influence is data - never the component structure.
 * The `type`/`rest` destructuring relies on discriminated-union narrowing: each
 * `case` narrows `rest` to exactly that section's props.
 */
export function SectionRenderer({ section }: { section: Section }) {
  if (!section.visible) return null;
  return <SwitchedSection section={section} />;
}

/**
 * The `switch` narrows `section` to a single member of the union, and only then
 * are `id`/`visible`/`type` stripped - so `props` is exactly `SectionProps<T>`
 * with no cast. Adding a section type without a case here is a type error.
 */
function SwitchedSection({ section }: { section: Section }) {
  switch (section.type) {
    case "Navbar":
      return <NavbarSection {...sectionProps(section)} />;
    case "Hero":
      return <HeroSection {...sectionProps(section)} />;
    case "Features":
      return <FeaturesSection {...sectionProps(section)} />;
    case "About":
      return <AboutSection {...sectionProps(section)} />;
    case "Services":
      return <ServicesSection {...sectionProps(section)} />;
    case "Products":
      return <ProductsSection {...sectionProps(section)} />;
    case "ProductGrid":
      return <ProductGridSection {...sectionProps(section)} />;
    case "ProductCard":
      return <ProductCardSection {...sectionProps(section)} />;
    case "Pricing":
      return <PricingSection {...sectionProps(section)} />;
    case "Testimonials":
      return <TestimonialsSection {...sectionProps(section)} />;
    case "FAQ":
      return <FaqSection {...sectionProps(section)} />;
    case "Gallery":
      return <GallerySection {...sectionProps(section)} />;
    case "Contact":
      return <ContactSection {...sectionProps(section)} />;
    case "CTA":
      return <CtaSection {...sectionProps(section)} />;
    case "Footer":
      return <FooterSection {...sectionProps(section)} />;
    case "Blog":
      return <BlogSection {...sectionProps(section)} />;
    case "Team":
      return <TeamSection {...sectionProps(section)} />;
    default:
      return assertNever(section);
  }
}

/** Drops the base fields; the generic keeps the discriminant in the result type. */
function sectionProps<T extends Section["type"]>(section: Extract<Section, { type: T }>): SectionProps<T> {
  const { id: _id, visible: _visible, type: _type, ...props } = section;
  return props as SectionProps<T>;
}

/** Section list without the surrounding page chrome. */
export function SectionList({ sections }: { sections: readonly Section[] }) {
  return (
    <>
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
