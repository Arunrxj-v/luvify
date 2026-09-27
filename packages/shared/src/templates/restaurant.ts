import { groundCopy, mergeTheme, personalize, sec, type SiteTemplate } from "./context";

export const restaurantTemplate: SiteTemplate = {
  id: "restaurant",
  name: "Restaurant",
  description: "Menu, story, gallery and reservations for restaurants, cafes and bakeries.",
  bestFor: "Restaurants, cafes, bakeries, cloud kitchens",
  websiteType: "restaurant",
  swatch: { primary: "#8c2f13", accent: "#e0a12a", background: "#fffaf3" },
  create(context) {
    const p = personalize(context);
    const theme = mergeTheme(
      {
        style: "warm",
        radius: 18,
        colors: {
          primary: "#8c2f13",
          secondary: "#2b1a12",
          accent: "#e0a12a",
          background: "#fffaf3",
          surface: "#f8eee1",
          foreground: "#241611",
          muted: "#7a675c",
          border: "#eaded0",
        },
        fonts: { heading: "Fraunces", body: "Work Sans" },
      },
      context,
    );

    // Menu items are always grounded in the project's own requirements.
    // When no services are defined, derive them from the business offerings
    // so the template never injects business-specific content from outside
    // the current project.
    const menu = p.services.length
      ? p.services
      : p.offerings.slice(0, 6).map((offering) => ({
          title: offering.charAt(0).toUpperCase() + offering.slice(1),
          description: "",
          price: "",
        }));

    return {
      siteName: p.siteName,
      tagline: p.tagline || "Slow-cooked regional food, served the way it should be",
      theme,
      contact: p.contact,
      socials: p.socials,
      pages: [
        {
          name: "Home",
          path: "/",
          title: `${p.siteName} - regional kitchen and dining room`,
          description: p.seoDescription || `${p.siteName} serves seasonal, slow-cooked regional food. Book a table or order takeaway.`,
          sections: [
            sec("Navbar", {
              logoText: p.siteName,
              links: [
                { label: "Menu", path: "/menu" },
                { label: "Our story", path: "/about" },
                { label: "Gallery", path: "/gallery" },
                { label: "Visit", path: "/contact" },
              ],
              cta: { label: "Book a table", path: "/contact" },
            }),
            sec("Hero", {
              eyebrow: "Now taking reservations",
              title: p.headline || p.productSummary || `${p.siteName}: a neighbourhood kitchen worth travelling for`,
              subtitle: groundCopy({
                client: p.subheadline,
                offerings: p.offerings,
                fallback:
                  "Seasonal produce, whole spices and a dining room built for long dinners. Walk-ins welcome at the bar.",
              }),
              primaryCta: { label: "Book a table", path: "/contact" },
              secondaryCta: { label: "See the menu", path: "/menu" },
              size: "tall",
              ...(p.productSummary || p.subheadline
                ? {}
                : {
                    stats: [
                      { value: "Open daily", label: "Lunch & dinner" },
                      { value: "4.8", label: "Guest rating" },
                      { value: "12", label: "Years in the neighbourhood" },
                    ],
                  }),
              trustLine: p.productSummary || p.subheadline ? "" : "Reservations confirmed within the hour",
            }),
            sec("About", {
              eyebrow: "Our kitchen",
              title: "Cooked in small batches, served with intent",
              body: p.about.length
                ? p.about
                : [
                    "We opened with one stove, one spice box and a rule: no shortcuts. Every sauce is built from scratch each morning.",
                    "Our produce comes from three growers within 40 km, and the menu changes with what they bring us.",
                  ],
              imagePosition: "right",
              highlights: p.offerings.length ? p.offerings.slice(0, 3).map((offering) => offering.charAt(0).toUpperCase() + offering.slice(1)) : ["Seasonal menu", "Vegetarian and vegan options", "Family-run since 2013"],
              signature: "The family",
            }),
            sec("Gallery", {
              eyebrow: "Inside",
              title: "The room, the plates, the regulars",
              subtitle: "Add your own photographs from the Inspector panel.",
              columns: 3,
              images: [],
            }),
            sec("Testimonials", {
              title: "What our guests say",
              items: p.testimonials.length
                ? p.testimonials
                : [
                    { quote: "The fish curry is the best I have had outside Kerala.", author: "Priya M.", role: "Regular since 2016", rating: 5 },
                    { quote: "They remembered our anniversary and brought out dessert. That is service.", author: "Daniel K.", role: "Dined in April", rating: 5 },
                  ],
            }),
            ...(p.faq.length
              ? [
                  sec("FAQ", {
                    title: "Before you visit",
                    items: p.faq,
                  }),
                ]
              : []),
            sec("CTA", {
              title: "Hungry? Book your table in under a minute",
              body: "Choose a date and time and we will confirm by email.",
              button: { label: "Book a table", path: "/contact" },
              variant: "solid",
              note: "Walk-ins welcome at the bar every evening.",
            }),
          ],
        },
        {
          name: "Menu",
          path: "/menu",
          title: `Menu - ${p.siteName}`,
          description: "Seasonal menu with prices, including vegan and gluten-free options.",
          sections: [
            sec("Services", {
              eyebrow: "Kitchen favourites",
              title: "Tonight's menu",
              subtitle: "Changes weekly with what our growers bring in.",
              layout: "list",
              items: menu,
            }),
            sec("CTA", {
              title: "Order for collection",
              body: "Call ahead and we will have it ready when you arrive.",
              button: { label: "Call the kitchen", path: p.contact.phone ? `tel:${p.contact.phone}` : "/contact" },
              variant: "accent",
            }),
          ],
        },
        {
          name: "Our story",
          path: "/about",
          title: `Our story - ${p.siteName}`,
          description: "Who we are, how we cook and where our produce comes from.",
          sections: [
            sec("About", {
              eyebrow: "Since day one",
              title: "A kitchen built on patience",
              body: p.about.length
                ? p.about
                : [
                    "Our first menu had nine dishes. We still cook six of them.",
                    "We buy whole animals and whole fish, use every part, and let the seasons decide the rest.",
                  ],
              imagePosition: "left",
              stats: [
                { value: "3", label: "Local growers" },
                { value: "0", label: "Freezers" },
              ],
            }),
            sec("Team", {
              title: "The people behind the pass",
              members: [
                { name: "Head chef", role: "Kitchen", bio: "Trained in regional home kitchens and European brasseries." },
                { name: "Front of house", role: "Service", bio: "Knows every regular by name and every dish by heart." },
              ],
            }),
          ],
        },
        {
          name: "Gallery",
          path: "/gallery",
          title: `Gallery - ${p.siteName}`,
          description: "Photographs of our dining room and dishes.",
          sections: [
            sec("Gallery", {
              title: "Moments from the dining room",
              subtitle: "These are placeholders - add your own photos from the Inspector panel.",
              columns: 3,
              images: [],
            }),
          ],
        },
        {
          name: "Visit",
          path: "/contact",
          title: `Visit us - ${p.siteName}`,
          description: "Opening hours, address and reservations.",
          sections: [
            sec("Contact", {
              title: "Book a table",
              subtitle: "Send your date and party size and we will confirm by email.",
              email: p.contact.email,
              phone: p.contact.phone,
              address: p.contact.address || "Add your address in the Inspector panel",
              hours: p.contact.hours || "Tue-Sun, 12:00 - 23:00",
              showForm: true,
              formFields: ["name", "email", "phone", "date", "message"],
              formAction: "booking",
              submitLabel: "Request reservation",
              successMessage: "Thanks! We will confirm your table by email shortly.",
              socials: p.socials,
            }),
          ],
        },
      ],
    };
  },
};
