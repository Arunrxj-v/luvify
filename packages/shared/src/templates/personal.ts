import { mergeTheme, personalize, sec, type SiteTemplate } from "./context";

export const personalTemplate: SiteTemplate = {
  id: "personal",
  name: "Personal brand",
  description: "Personal site with bio, writing, talks, newsletter and a direct contact block.",
  bestFor: "Consultants, coaches, writers, speakers, developers",
  websiteType: "personal",
  swatch: { primary: "#1d4ed8", accent: "#10b981", background: "#f8fafc" },
  create(context) {
    const p = personalize(context);
    const theme = mergeTheme(
      {
        style: "minimal",
        radius: 8,
        buttonStyle: "pill",
        colors: {
          primary: "#1d4ed8",
          secondary: "#0f172a",
          accent: "#10b981",
          background: "#ffffff",
          surface: "#f6f8fc",
          foreground: "#0f172a",
          muted: "#64748b",
          border: "#e2e8f0",
        },
        fonts: { heading: "Libre Baskerville", body: "Source Sans 3" },
      },
      context,
    );

    const services = p.services.length
      ? p.services
      : [
          { title: "Advisory calls", description: "One-off 60-minute sessions on positioning, pricing or hiring.", price: "250" },
          { title: "Ongoing coaching", description: "Two calls a month with async support in between.", price: "900 / month" },
          { title: "Workshops", description: "Half-day sessions for teams of 5-20 people.", price: "from 2,400" },
        ];

    return {
      siteName: p.siteName,
      tagline: p.tagline || "Independent consultant and writer",
      theme,
      contact: p.contact,
      socials: p.socials,
      pages: [
        {
          name: "Home",
          path: "/",
          title: `${p.siteName} - ${p.tagline || "consultant and writer"}`,
          description: p.seoDescription || `${p.siteName} works with founders and product teams on strategy, positioning and growth.`,
          sections: [
            sec("Navbar", {
              logoText: p.siteName,
              links: [
                { label: "About", path: "/about" },
                { label: "Writing", path: "/writing" },
                { label: "Work with me", path: "/work-with-me" },
                { label: "Contact", path: "/contact" },
              ],
              cta: { label: "Book a call", path: "/contact" },
              style: "bordered",
            }),
            sec("Hero", {
              eyebrow: "Available for two projects this quarter",
              title: p.headline || `Hi, I'm ${p.siteName}. I help teams decide what to build next.`,
              subtitle:
                "Fifteen years in product, the last six independent. I work with founders and product leaders on positioning, prioritisation and the hard calls in between.",
              primaryCta: { label: "Book a call", path: "/contact" },
              secondaryCta: { label: "Read my writing", path: "/writing" },
              size: "compact",
              align: "left",
            }),
            sec("About", {
              eyebrow: "About",
              title: "Short version",
              body: p.about.length
                ? p.about
                : [
                    "I spent a decade building products at companies of 20, 200 and 2,000 people before going independent.",
                    "Now I help a small number of teams each year - usually when the roadmap is bigger than the team or the story is not landing with customers.",
                  ],
              imagePosition: "right",
              signature: p.siteName,
            }),
            sec("Services", {
              eyebrow: "Work with me",
              title: "Three ways to work together",
              layout: "grid",
              columns: 3,
              items: services,
            }),
            sec("Blog", {
              eyebrow: "Writing",
              title: "Recent posts",
              subtitle: "Essays on product strategy, pricing and the craft of deciding.",
              layout: "list",
              posts: [
                { title: "Your roadmap is a hypothesis, not a promise", excerpt: "How to communicate a plan without pretending the future is knowable.", date: "2026", readingTime: "6 min" },
                { title: "Pricing is a product decision", excerpt: "Why discounting is usually a symptom, not a strategy.", date: "2025", readingTime: "8 min" },
                { title: "The three questions before you hire", excerpt: "A short checklist that prevents most premature hiring.", date: "2025", readingTime: "4 min" },
              ],
            }),
            sec("CTA", {
              title: "Book a 60-minute call",
              body: "Bring one decision you are stuck on. You will leave with a next step.",
              button: { label: "Find a time", path: "/contact" },
              variant: "solid",
              note: "No pitch, no obligation.",
            }),
          ],
        },
        {
          name: "About",
          path: "/about",
          title: `About ${p.siteName}`,
          description: "Background, areas of work and how engagements usually run.",
          sections: [
            sec("About", {
              eyebrow: "Background",
              title: "Fifteen years, three industries",
              body: p.about.length
                ? p.about
                : [
                    "I have led product teams in media, fintech and developer tooling, from first hire to post-acquisition integration.",
                    "I write about the parts of product work that do not fit in a framework diagram.",
                  ],
              imagePosition: "left",
              highlights: ["Product strategy", "Positioning & pricing", "Team design"],
            }),
            sec("Testimonials", {
              title: "What clients say",
              items: p.testimonials.length
                ? p.testimonials
                : [{ quote: "Two calls in and we had killed a quarter of the roadmap. Revenue went up anyway.", author: "Founder", role: "B2B SaaS", rating: 5 }],
            }),
          ],
        },
        {
          name: "Writing",
          path: "/writing",
          title: `Writing - ${p.siteName}`,
          description: "Essays and notes on product strategy and decision making.",
          sections: [
            sec("Blog", {
              eyebrow: "Archive",
              title: "Essays and notes",
              layout: "list",
              posts: [
                { title: "How to run a decision review", excerpt: "A 30-minute format for reversing bad calls early.", date: "2026", readingTime: "5 min" },
                { title: "Positioning for teams that hate marketing", excerpt: "Start with who you are not for.", date: "2025", readingTime: "7 min" },
                { title: "Retention is a design problem", excerpt: "Onboarding flows are arguments, not tutorials.", date: "2025", readingTime: "6 min" },
              ],
            }),
          ],
        },
        {
          name: "Work with me",
          path: "/work-with-me",
          title: `Work with me - ${p.siteName}`,
          description: "Engagement options, pricing and availability.",
          sections: [
            sec("Services", {
              title: "Engagements",
              subtitle: "All engagements include a written summary and follow-up access for 30 days.",
              layout: "list",
              items: services,
            }),
            sec("FAQ", {
              title: "Practical questions",
              items: p.faq.length
                ? p.faq
                : [
                    { question: "How quickly can we start?", answer: "Usually within two weeks, depending on the current queue." },
                    { question: "Do you sign NDAs?", answer: "Yes, or we can start with a mutual one-pager." },
                  ],
            }),
          ],
        },
        {
          name: "Contact",
          path: "/contact",
          title: `Contact ${p.siteName}`,
          description: "Book a call or send a message.",
          sections: [
            sec("Contact", {
              title: "Let's talk",
              subtitle: "Tell me what you are working on and what decision you are stuck on.",
              email: p.contact.email || "hello@example.com",
              phone: p.contact.phone,
              address: p.contact.address,
              hours: p.contact.hours,
              showForm: true,
              formFields: ["name", "email", "message"],
              formAction: "mailto",
              submitLabel: "Send message",
              successMessage: "Thanks - I reply to every message within two working days.",
              socials: p.socials,
            }),
          ],
        },
      ],
    };
  },
};
