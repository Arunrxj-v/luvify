import { mergeTheme, personalize, sec, type SiteTemplate } from "./context";

export const agencyTemplate: SiteTemplate = {
  id: "agency",
  name: "Design agency",
  description: "Studio site with services, case studies, team, process and an enquiry funnel.",
  bestFor: "Agencies, studios, consultancies, freelancers with a team",
  websiteType: "agency",
  swatch: { primary: "#0f766e", accent: "#f59e0b", background: "#0b1220" },
  create(context) {
    const p = personalize(context);
    const theme = mergeTheme(
      {
        style: "bold",
        dark: true,
        radius: 10,
        colors: {
          primary: "#14b8a6",
          secondary: "#0b1220",
          accent: "#f59e0b",
          background: "#0b1220",
          surface: "#131c31",
          foreground: "#f8fafc",
          muted: "#93a1bd",
          border: "#22304d",
        },
        fonts: { heading: "Space Grotesk", body: "Inter" },
      },
      context,
    );

    const services = p.services.length
      ? p.services
      : [
          { title: "Brand strategy", description: "Positioning, naming, messaging and a voice your team can actually use.", price: "" },
          { title: "Identity design", description: "Logo systems, typography, colour and rollout guidelines.", price: "" },
          { title: "Website & product design", description: "Design systems, marketing sites and interface design in Figma.", price: "" },
          { title: "Build & launch", description: "Front-end implementation, CMS setup, analytics and handover.", price: "" },
        ];

    return {
      siteName: p.siteName,
      tagline: p.tagline || "A small studio doing careful brand and digital work",
      theme,
      contact: p.contact,
      socials: p.socials,
      pages: [
        {
          name: "Home",
          path: "/",
          title: `${p.siteName} - brand and digital studio`,
          description: p.seoDescription || `${p.siteName} is a studio for brand strategy, identity and website design.`,
          sections: [
            sec("Navbar", {
              logoText: p.siteName,
              links: [
                { label: "Services", path: "/services" },
                { label: "Work", path: "/work" },
                { label: "Studio", path: "/about" },
                { label: "Contact", path: "/contact" },
              ],
              cta: { label: "Start a project", path: "/contact" },
              style: "transparent",
            }),
            sec("Hero", {
              eyebrow: "Booking projects from next month",
              title: p.headline || "We build brands that survive contact with the market",
              subtitle:
                "Strategy, identity and websites under one roof. A team of four, working with eight clients a year.",
              primaryCta: { label: "Start a project", path: "/contact" },
              secondaryCta: { label: "See our work", path: "/work" },
              size: "tall",
              stats: [
                { value: "4", label: "People in the studio" },
                { value: "8", label: "Projects a year" },
                { value: "11", label: "Years in business" },
              ],
            }),
            sec("Services", {
              eyebrow: "What we do",
              title: "Four services, done properly",
              subtitle: "Engagements usually run 6-14 weeks end to end.",
              layout: "grid",
              columns: 2,
              items: services,
            }),
            sec("Team", {
              eyebrow: "The studio",
              title: "Small on purpose",
              members: [
                { name: "Strategy lead", role: "Positioning & research", bio: "Ten years in-house before moving to the studio side." },
                { name: "Design director", role: "Identity & art direction", bio: "Believes a good system beats a clever logo." },
                { name: "Technology lead", role: "Front-end & CMS", bio: "Ships sites that editors enjoy using." },
              ],
            }),
            sec("Testimonials", {
              title: "Client feedback",
              items: p.testimonials.length
                ? p.testimonials
                : [
                    { quote: "They asked better questions than any agency we spoke to, then delivered ahead of schedule.", author: "Client name", role: "Founder, manufacturer", rating: 5 },
                  ],
            }),
            sec("CTA", {
              title: "Tell us what you are building",
              body: "Share the brief. We reply within two working days with an honest yes, no, or a referral to someone better suited.",
              button: { label: "Start a project", path: "/contact" },
              variant: "accent",
            }),
          ],
        },
        {
          name: "Work",
          path: "/work",
          title: `Work - ${p.siteName}`,
          description: "Selected brand and website projects with the thinking behind them.",
          sections: [
            sec("Blog", {
              eyebrow: "Case studies",
              title: "Selected work",
              subtitle: "Add your own case studies from the Inspector panel.",
              layout: "grid",
              posts: [
                { title: "Rebranding a 40-year-old manufacturer", excerpt: "Repositioning from component supplier to category authority, plus a site the sales team can drive.", date: "2026", category: "Manufacturing" },
                { title: "Direct booking for a boutique hotel group", excerpt: "A booking experience that reduced OTA dependency by a third.", date: "2025", category: "Hospitality" },
                { title: "Identity and packaging for a coffee roaster", excerpt: "Name, identity system and packaging rollout across four SKUs.", date: "2025", category: "Retail" },
              ],
            }),
            sec("Gallery", {
              title: "Process shots",
              subtitle: "Workshop walls, prototypes and printed samples.",
              columns: 3,
              images: [],
            }),
          ],
        },
        {
          name: "Services",
          path: "/services",
          title: `Services - ${p.siteName}`,
          description: "Service scope, typical timelines and deliverables.",
          sections: [
            sec("Services", {
              title: "Scope and timelines",
              layout: "list",
              items: services.map((service) => ({ ...service, duration: "4-6 weeks" })),
            }),
            sec("FAQ", {
              title: "Working together",
              items: p.faq.length
                ? p.faq
                : [
                    { question: "What does a project cost?", answer: "Identity projects start at 12k, websites at 18k, combined programmes are quoted per phase." },
                    { question: "Do you work with in-house teams?", answer: "Often - we embed with your marketing team and hand over the system with training." },
                  ],
            }),
          ],
        },
        {
          name: "Studio",
          path: "/about",
          title: `Studio - ${p.siteName}`,
          description: "How we work, who we are and what an engagement looks like.",
          sections: [
            sec("About", {
              eyebrow: "How we work",
              title: "A process built around decisions",
              body: p.about.length
                ? p.about
                : [
                    "We start with two weeks of research and finish with a system your team can run without us.",
                    "You get direct access to the people doing the work - no account layer, no telephone game.",
                  ],
              imagePosition: "right",
              highlights: ["Fixed-scope phases", "Weekly working sessions", "Handover documentation"],
            }),
            sec("Team", {
              title: "Who you will work with",
              members: [
                { name: "Strategy lead", role: "Research & positioning" },
                { name: "Design director", role: "Identity & art direction" },
                { name: "Technology lead", role: "Build & handover" },
              ],
            }),
          ],
        },
        {
          name: "Contact",
          path: "/contact",
          title: `Contact - ${p.siteName}`,
          description: "Enquiry form, studio address and booking information.",
          sections: [
            sec("Contact", {
              eyebrow: "New business",
              title: "Start a project",
              subtitle: "The more context you give us, the more useful our first reply will be.",
              email: p.contact.email || "studio@example.com",
              phone: p.contact.phone,
              address: p.contact.address || "Add your studio address in the Inspector panel",
              hours: p.contact.hours,
              showForm: true,
              formFields: ["name", "email", "company", "message"],
              formAction: "mailto",
              submitLabel: "Send enquiry",
              successMessage: "Received - expect a reply within two working days.",
              socials: p.socials,
            }),
          ],
        },
      ],
    };
  },
};
