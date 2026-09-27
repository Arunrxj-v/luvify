import { mergeTheme, personalize, sec, type SiteTemplate } from "./context";

export const portfolioTemplate: SiteTemplate = {
  id: "portfolio",
  name: "Creative portfolio",
  description: "Image-first portfolio with case studies, services and a contact/booking block.",
  bestFor: "Photographers, designers, illustrators, videographers",
  websiteType: "portfolio",
  swatch: { primary: "#111827", accent: "#d97706", background: "#fbfbfa" },
  create(context) {
    const p = personalize(context);
    const theme = mergeTheme(
      {
        style: "editorial",
        radius: 4,
        buttonStyle: "square",
        colors: {
          primary: "#111827",
          secondary: "#3f3f46",
          accent: "#d97706",
          background: "#fbfbfa",
          surface: "#f2f1ee",
          foreground: "#18181b",
          muted: "#6b7280",
          border: "#e5e3de",
        },
        fonts: { heading: "Playfair Display", body: "Inter" },
      },
      context,
    );

    const services = p.services.length
      ? p.services
      : [
          { title: "Portrait sessions", description: "90 minutes on location or in studio, 40+ edited frames.", price: "from 450" },
          { title: "Editorial commissions", description: "Half-day and full-day coverage for magazines and brands.", price: "day rate on request" },
          { title: "Brand imagery", description: "Product, team and lifestyle libraries shot for your launch.", price: "from 1,800" },
        ];

    return {
      siteName: p.siteName,
      tagline: p.tagline || "Documentary and portrait photography with an eye for quiet detail",
      theme,
      contact: p.contact,
      socials: p.socials,
      pages: [
        {
          name: "Home",
          path: "/",
          title: `${p.siteName} - ${p.tagline || "photography portfolio"}`,
          description: p.seoDescription || `Selected work, services and booking information for ${p.siteName}.`,
          sections: [
            sec("Navbar", {
              logoText: p.siteName,
              links: [
                { label: "Work", path: "/work" },
                { label: "About", path: "/about" },
                { label: "Services", path: "/services" },
                { label: "Contact", path: "/contact" },
              ],
              cta: { label: "Book a shoot", path: "/contact" },
              style: "bordered",
            }),
            sec("Hero", {
              eyebrow: "Selected work 2024 - 2026",
              title: p.headline || "Photographs that hold their nerve",
              subtitle:
                "Documentary, portrait and editorial photography for people who would rather be shown honestly than flatteringly.",
              primaryCta: { label: "View the work", path: "/work" },
              secondaryCta: { label: "Check availability", path: "/contact" },
              size: "tall",
              align: "left",
              trustLine: "Currently booking sessions 6-8 weeks ahead",
            }),
            sec("Gallery", {
              eyebrow: "Recent frames",
              title: "Work",
              subtitle: "Replace these placeholders with your own portfolio from the Inspector panel.",
              columns: 3,
              images: [],
            }),
            sec("About", {
              eyebrow: "About",
              title: p.siteName,
              body: p.about.length
                ? p.about
                : [
                    "I have been photographing people, places and quiet in-between moments for eleven years.",
                    "My approach is unhurried: I would rather spend an extra hour with you than rush a frame.",
                  ],
              imagePosition: "left",
              signature: p.siteName,
            }),
            sec("Testimonials", {
              title: "Kind words",
              items: p.testimonials.length
                ? p.testimonials
                : [{ quote: "The photos felt like us, not like a stock shoot.", author: "Client name", role: "Brand session", rating: 5 }],
            }),
            sec("CTA", {
              title: "Let's talk about your project",
              body: "Tell me the dates, the location and what the pictures need to do.",
              button: { label: "Start a conversation", path: "/contact" },
              variant: "outline",
            }),
          ],
        },
        {
          name: "Services",
          path: "/services",
          title: `Services & rates - ${p.siteName}`,
          description: "Session types, deliverables and starting prices.",
          sections: [
            sec("Services", {
              title: "What I offer",
              subtitle: "Every commission includes a pre-shoot call, colour grading and web-ready files.",
              layout: "grid",
              items: services,
            }),
            sec("FAQ", {
              title: "Booking questions",
              items: p.faq.length
                ? p.faq
                : [
                    { question: "How do bookings work?", answer: "A 30% deposit confirms the date; the balance is due on delivery." },
                    { question: "Do you travel?", answer: "Yes - travel within the region is included, further afield is quoted at cost." },
                  ],
            }),
          ],
        },
        {
          name: "About",
          path: "/about",
          title: `About - ${p.siteName}`,
          description: "Biography, approach and clients.",
          sections: [
            sec("About", {
              eyebrow: "Biography",
              title: "Eleven years behind the camera",
              body: p.about.length
                ? p.about
                : [
                    "Trained in photojournalism, now working across editorial and commercial commissions.",
                    "Recent clients include independent magazines, design studios and family businesses.",
                  ],
              imagePosition: "right",
              stats: [
                { value: "180+", label: "Commissions" },
                { value: "14", label: "Countries" },
              ],
            }),
          ],
        },
        {
          name: "Contact",
          path: "/contact",
          title: `Contact - ${p.siteName}`,
          description: "Check availability and start a booking.",
          sections: [
            sec("Contact", {
              title: "Check availability",
              subtitle: "Send your date and a short brief - I reply to every enquiry personally.",
              email: p.contact.email || "hello@example.com",
              phone: p.contact.phone,
              address: p.contact.address,
              hours: p.contact.hours,
              showForm: true,
              formFields: ["name", "email", "date", "message"],
              formAction: "mailto",
              submitLabel: "Send enquiry",
              successMessage: "Thank you - I will reply within two working days.",
              socials: p.socials,
            }),
          ],
        },
      ],
    };
  },
};
