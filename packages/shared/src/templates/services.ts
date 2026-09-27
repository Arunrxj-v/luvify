import { groundCopy, mergeTheme, personalize, sec, type SiteTemplate } from "./context";

/**
 * Neutral services template: visual structure WITHOUT domain-specific copy.
 *
 * Unlike the domain templates (restaurant, agency, ...), every fallback here
 * is generic, non-factual presentation copy ("Our services", "Get in touch").
 * All items come from the project's own requirements - offerings-derived when
 * the client named concepts, client data when provided, honest empty states
 * otherwise. Gated sections (testimonials, pricing, team, blog, FAQ) render
 * only from verified client information, never from invented placeholders.
 */
export const servicesTemplate: SiteTemplate = {
  id: "services",
  name: "Services business",
  description: "Neutral structure for service businesses, clinics, bookings and local services.",
  bestFor: "Clinics, hospitals, local services, bookings, agencies without a niche template",
  websiteType: "business",
  swatch: { primary: "#0f766e", accent: "#f59e0b", background: "#ffffff" },
  create(context) {
    const p = personalize(context);
    const theme = mergeTheme(
      {
        style: "corporate",
        radius: 10,
        colors: {
          primary: "#0f766e",
          secondary: "#0f172a",
          accent: "#f59e0b",
          background: "#ffffff",
          surface: "#f4f7f6",
          foreground: "#0f172a",
          muted: "#5b6478",
          border: "#e2e8f0",
        },
        fonts: { heading: "Inter", body: "Inter" },
      },
      context,
    );

    const services = p.services;
    const links = [
      { label: "Services", path: "/services" },
      { label: "About", path: "/about" },
      { label: "Contact", path: "/contact" },
    ];

    return {
      siteName: p.siteName,
      tagline: p.tagline,
      theme,
      contact: p.contact,
      socials: p.socials,
      pages: [
        {
          name: "Home",
          path: "/",
          title: `${p.siteName}`,
          description: p.seoDescription,
          sections: [
            sec("Navbar", {
              logoText: p.siteName,
              links,
              cta: { label: "Contact us", path: "/contact" },
            }),
            sec("Hero", {
              eyebrow: "",
              title:
                p.headline ||
                groundCopy({ facts: p.productSummary ? [p.productSummary] : [], offerings: p.offerings }) ||
                p.siteName,
              subtitle: groundCopy({ client: p.subheadline, offerings: p.offerings }),
              primaryCta: { label: "Contact us", path: "/contact" },
              secondaryCta: { label: "Our services", path: "/services" },
              size: "standard",
              align: "left",
            }),
            sec("Services", {
              eyebrow: "",
              title: "Our services",
              subtitle: "",
              layout: "grid",
              columns: 3,
              items: services,
            }),
            ...(p.testimonials.length
              ? [sec("Testimonials", { title: "What our clients say", items: p.testimonials })]
              : []),
            ...(p.faq.length ? [sec("FAQ", { title: "Common questions", items: p.faq })] : []),
            sec("CTA", {
              title: "Get in touch",
              body: groundCopy({ offerings: p.offerings, facts: p.productSummary ? [p.productSummary] : [] }),
              button: { label: "Contact us", path: "/contact" },
              variant: "solid",
            }),
          ],
        },
        {
          name: "Services",
          path: "/services",
          title: `Services - ${p.siteName}`,
          description: p.seoDescription,
          sections: [
            sec("Services", {
              title: "What we offer",
              layout: "list",
              items: services,
            }),
            ...(p.faq.length ? [sec("FAQ", { title: "Common questions", items: p.faq })] : []),
            sec("CTA", {
              title: "Get in touch",
              button: { label: "Contact us", path: "/contact" },
              variant: "solid",
            }),
          ],
        },
        {
          name: "About",
          path: "/about",
          title: `About - ${p.siteName}`,
          description: p.seoDescription,
          sections: [
            sec("About", {
              eyebrow: "",
              title: `About ${p.siteName}`,
              body: p.about,
              imagePosition: "right",
              highlights: [],
            }),
          ],
        },
        {
          name: "Contact",
          path: "/contact",
          title: `Contact - ${p.siteName}`,
          description: p.seoDescription,
          sections: [
            sec("Contact", {
              eyebrow: "",
              title: "Contact us",
              subtitle: "",
              email: p.contact.email,
              phone: p.contact.phone,
              address: p.contact.address,
              hours: p.contact.hours,
              showForm: true,
              formFields: ["name", "email", "message"],
              formAction: "mailto",
              submitLabel: "Send message",
              successMessage: "Thanks for getting in touch.",
              socials: p.socials,
            }),
          ],
        },
      ],
    };
  },
};
