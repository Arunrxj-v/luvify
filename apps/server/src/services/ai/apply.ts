/**
 * Applies AI-generated copy onto a page's existing sections.
 *
 * The model never proposes components: the document's structure comes from the
 * approved architecture and the template registry, and this module only patches
 * the fields each section schema already exposes. Anything the model returns
 * that a section does not support is ignored, which is what keeps the output
 * renderer-compatible.
 *
 * Verified contact details are deliberately NOT overwritten - they come from the
 * client's requirements, not from the model.
 */

import type { Link, ProjectKnowledge, SectionType, SitePage } from "@luvify/shared";
import type { PageCopy } from "./schemas";

type AnySection = SitePage["sections"][number];

/** Uses the generated value when it carries content, otherwise keeps the old one. */
function text(next: string | undefined, current: string): string {
  return typeof next === "string" && next.trim().length > 0 ? next : current;
}

/** Uses the generated list when it is non-empty, otherwise keeps the old one. */
function list(next: string[] | undefined, current: string[]): string[] {
  return Array.isArray(next) && next.length > 0 ? next : current;
}

/** Section types this module knows how to rewrite. */
const PATCHABLE: ReadonlySet<SectionType> = new Set<SectionType>([
  "Hero",
  "About",
  "Features",
  "Services",
  "FAQ",
  "CTA",
  "Contact",
  "Gallery",
  "Testimonials",
  "Team",
  "Blog",
]);

export interface ApplyCopyOptions {
  /** Navigation links for the whole site, used to keep CTAs pointing somewhere real. */
  navigation: Link[];
  knowledge: ProjectKnowledge;
}

/**
 * Rewrites one page in place from AI copy. Returns a new page object; the input
 * is not mutated.
 */
export function applyPageCopy(page: SitePage, copy: PageCopy, options: ApplyCopyOptions): SitePage {
  const sections = copy.sections;
  const fallbackPath = options.navigation[0]?.path ?? "/";

  const patched = page.sections.map((section): AnySection => {
    if (!PATCHABLE.has(section.type)) return section;

    switch (section.type) {
      case "Hero": {
        const hero = sections.hero;
        if (!hero) return section;
        const ctaPath = section.primaryCta?.path && isKnownPath(section.primaryCta.path, options)
          ? section.primaryCta.path
          : fallbackPath;
        return {
          ...section,
          eyebrow: text(hero.eyebrow, section.eyebrow),
          title: text(hero.title, section.title),
          subtitle: text(hero.subtitle, section.subtitle),
          trustLine: text(hero.trustLine, section.trustLine),
          primaryCta: {
            label: text(hero.primaryCtaLabel, section.primaryCta?.label ?? "Get in touch"),
            path: ctaPath,
            external: section.primaryCta?.external ?? false,
          },
        };
      }
      case "About": {
        const about = sections.about;
        if (!about) return section;
        return {
          ...section,
          eyebrow: text(about.eyebrow, section.eyebrow),
          title: text(about.title, section.title),
          body: list(about.body, section.body),
          highlights: list(about.highlights, section.highlights),
        };
      }
      case "Features": {
        const features = sections.features;
        if (!features) return section;
        // The renderer's Features item also carries an `icon`; the model does
        // not choose icons, so it stays empty for the template to fill.
        const items =
          features.items.length > 0
            ? features.items.map((item) => ({ icon: "", title: item.title, description: item.description }))
            : section.items;
        return {
          ...section,
          eyebrow: text(features.eyebrow, section.eyebrow),
          title: text(features.title, section.title),
          subtitle: text(features.subtitle, section.subtitle),
          items,
        };
      }
      case "Services": {
        const services = sections.services;
        if (!services) return section;
        const items = services.items.length > 0 ? services.items : section.items;
        return {
          ...section,
          eyebrow: text(services.eyebrow, section.eyebrow),
          title: text(services.title, section.title),
          subtitle: text(services.subtitle, section.subtitle),
          items,
        };
      }
      case "FAQ": {
        const faq = sections.faq;
        if (!faq) return section;
        const items = faq.items.length > 0 ? faq.items : section.items;
        return {
          ...section,
          eyebrow: text(faq.eyebrow, section.eyebrow),
          title: text(faq.title, section.title),
          subtitle: text(faq.subtitle, section.subtitle),
          items,
        };
      }
      case "CTA": {
        const cta = sections.cta;
        if (!cta) return section;
        return {
          ...section,
          eyebrow: text(cta.eyebrow, section.eyebrow),
          title: text(cta.title, section.title),
          body: text(cta.body, section.body),
          button: {
            label: text(cta.buttonLabel, section.button?.label ?? "Contact us"),
            path: section.button?.path && isKnownPath(section.button.path, options)
              ? section.button.path
              : fallbackPath,
            external: section.button?.external ?? false,
          },
        };
      }
      case "Contact": {
        const contact = sections.contact;
        if (!contact) return section;
        // email/phone/address/hours stay as the client provided them.
        return {
          ...section,
          eyebrow: text(contact.eyebrow, section.eyebrow),
          title: text(contact.title, section.title),
          subtitle: text(contact.subtitle, section.subtitle),
        };
      }
      default:
        return applyCollectionSection(section, sections);
    }
  });

  return { ...page, title: text(copy.title, page.title), description: text(copy.description, page.description), sections: patched };
}

/** Keeps generated links internal: only paths that exist in the site survive. */
function isKnownPath(path: string, options: ApplyCopyOptions): boolean {
  if (path === "/") return true;
  return options.navigation.some((link) => link.path === path);
}

type SectionCopy = PageCopy["sections"];

/** Gallery / Testimonials / Team / Blog - collection sections with item lists. */
function applyCollectionSection(section: AnySection, sections: SectionCopy): AnySection {
  switch (section.type) {
    case "Gallery": {
      const gallery = sections.gallery;
      if (!gallery) return section;
      return {
        ...section,
        eyebrow: text(gallery.eyebrow, section.eyebrow),
        title: text(gallery.title, section.title),
        subtitle: text(gallery.subtitle, section.subtitle),
      };
    }
    case "Testimonials": {
      const testimonials = sections.testimonials;
      if (!testimonials) return section;
      // Quotes are only ever the client's own: the model is not allowed to
      // author social proof, so its list is ignored when none were supplied.
      return {
        ...section,
        eyebrow: text(testimonials.eyebrow, section.eyebrow),
        title: text(testimonials.title, section.title),
        items: section.items,
      };
    }
    case "Team": {
      const team = sections.team;
      if (!team) return section;
      // Member names are facts, so the stored (client-provided) roster wins.
      return {
        ...section,
        eyebrow: text(team.eyebrow, section.eyebrow),
        title: text(team.title, section.title),
        subtitle: text(team.subtitle, section.subtitle),
        members: section.members,
      };
    }
    case "Blog": {
      const blog = sections.blog;
      if (!blog) return section;
      return {
        ...section,
        eyebrow: text(blog.eyebrow, section.eyebrow),
        title: text(blog.title, section.title),
        subtitle: text(blog.subtitle, section.subtitle),
      };
    }
    default:
      return section;
  }
}
