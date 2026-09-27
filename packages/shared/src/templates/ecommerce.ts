import { mergeTheme, personalize, sec, type SiteTemplate } from "./context";

export const ecommerceTemplate: SiteTemplate = {
  id: "ecommerce",
  name: "E-commerce store",
  description: "Product catalogue, category chips, shipping/returns policy and an order-enquiry funnel.",
  bestFor: "Shops, makers, DTC brands, marketplaces",
  websiteType: "ecommerce",
  swatch: { primary: "#7c3aed", accent: "#f472b6", background: "#ffffff" },
  create(context) {
    const p = personalize(context);
    const theme = mergeTheme(
      {
        style: "minimal",
        radius: 14,
        colors: {
          primary: "#7c3aed",
          secondary: "#18181b",
          accent: "#f472b6",
          background: "#ffffff",
          surface: "#faf5ff",
          foreground: "#18181b",
          muted: "#6b7280",
          border: "#ece7f5",
        },
        fonts: { heading: "Plus Jakarta Sans", body: "Inter" },
      },
      context,
    );

    // Products are always grounded in the project's own requirements.
    // When no products are defined, derive them from the business offerings
    // so the template never injects business-specific content from outside
    // the current project.
    const products = p.products.length
      ? p.products
      : p.offerings.slice(0, 6).map((offering) => ({
          name: offering.charAt(0).toUpperCase() + offering.slice(1),
          description: "",
          priceCents: 0,
          currency: "USD",
          category: "",
        }));
    const categories = Array.from(new Set(products.map((product) => product.category).filter(Boolean)));

    return {
      siteName: p.siteName,
      tagline: p.tagline || "Small-batch goods, made and shipped with care",
      theme,
      contact: p.contact,
      socials: p.socials,
      pages: [
        {
          name: "Home",
          path: "/",
          title: `${p.siteName} - shop`,
          description: p.seoDescription || `Shop small-batch products from ${p.siteName}. Free shipping over 60.`,
          sections: [
            sec("Navbar", {
              logoText: p.siteName,
              links: [
                { label: "Shop", path: "/shop" },
                { label: "About", path: "/about" },
                { label: "Shipping", path: "/shipping" },
                { label: "Contact", path: "/contact" },
              ],
              cta: { label: "Shop now", path: "/shop" },
            }),
            sec("Hero", {
              eyebrow: "Free shipping over 60",
              title: p.headline || `Everyday goods, made in small batches`,
              subtitle:
                "We make in runs of a few hundred, ship within one working day, and take returns for 30 days - no questions asked.",
              primaryCta: { label: "Shop the collection", path: "/shop" },
              secondaryCta: { label: "Our story", path: "/about" },
              size: "standard",
              stats: [
                { value: "1 day", label: "Dispatch time" },
                { value: "30 days", label: "Returns window" },
                { value: "4.9/5", label: "Customer rating" },
              ],
            }),
            sec("ProductGrid", {
              eyebrow: "Bestsellers",
              title: "Start here",
              subtitle: "Our six most-reordered products.",
              columns: 3,
              categories,
              items: products,
            }),
            sec("Features", {
              title: "Why people reorder",
              columns: 3,
              items: [
                { title: "Made in small batches", description: "Everything is poured, packed and checked by hand." },
                { title: "Refill, do not rebuy", description: "Refill pouches cut packaging by 82%." },
                { title: "Carbon-neutral shipping", description: "Offset on every order, tracked and verified." },
              ],
            }),
            sec("Testimonials", {
              title: "Customer reviews",
              items: p.testimonials.length
                ? p.testimonials
                : [
                    { quote: "Third reorder. The scent lasts for weeks.", author: "Customer name", role: "Verified buyer", rating: 5 },
                  ],
            }),
            sec("CTA", {
              title: "New here? Start with a gift set",
              body: "Our three bestsellers, boxed and ready to give.",
              button: { label: "Shop gift sets", path: "/shop" },
              variant: "accent",
            }),
          ],
        },
        {
          name: "Shop",
          path: "/shop",
          title: `Shop all - ${p.siteName}`,
          description: "Browse the full catalogue by category.",
          sections: [
            sec("Products", {
              eyebrow: "Catalogue",
              title: "All products",
              subtitle: "Free shipping on orders over 60.",
              columns: 3,
              items: products,
              showPrices: true,
              cta: { label: "Ask about bulk orders", path: "/contact" },
            }),
            sec("FAQ", {
              title: "Ordering questions",
              items: p.faq.length
                ? p.faq
                : [
                    { question: "How do I pay?", answer: "Checkout is arranged directly with our team while our online payment provider is being connected - we send a secure payment link with every order confirmation." },
                    { question: "Can I change my order?", answer: "Yes, until dispatch. Email us and we will adjust or cancel with a full refund." },
                  ],
            }),
          ],
        },
        {
          name: "About",
          path: "/about",
          title: `About - ${p.siteName}`,
          description: "Who makes our products and how they are produced.",
          sections: [
            sec("About", {
              eyebrow: "Our story",
              title: "Made by a small team, not a factory floor",
              body: p.about.length
                ? p.about
                : [
                    "We started in a kitchen with one pot and a market stall. The pot is bigger now, the standards are the same.",
                    "Every batch is tested, dated and packed by the people who made it.",
                  ],
              imagePosition: "right",
              highlights: ["Vegan and cruelty-free", "Recyclable packaging", "Made in one workshop"],
            }),
          ],
        },
        {
          name: "Shipping",
          path: "/shipping",
          title: `Shipping & returns - ${p.siteName}`,
          description: "Delivery times, shipping costs, returns policy and product care.",
          sections: [
            sec("Services", {
              eyebrow: "Policies",
              title: "Shipping and returns",
              subtitle: "Everything you need to know about delivery and returns.",
              layout: "list",
              items: [
                { title: "Standard delivery", description: "2-4 working days, tracked, free over 60.", price: "6.00" },
                { title: "Express delivery", description: "Next working day if ordered before 2pm.", price: "12.00" },
                { title: "Returns", description: "30 days, unused, free returns label included.", price: "free" },
                { title: "Product care", description: "Trim the wick, burn for four hours at a time.", price: "" },
              ],
            }),
            sec("Contact", {
              title: "Questions about an order?",
              subtitle: "Send us your order number and we will reply within one working day.",
              email: p.contact.email || "orders@example.com",
              phone: p.contact.phone,
              showForm: true,
              formFields: ["name", "email", "message"],
              formAction: "mailto",
              submitLabel: "Contact orders team",
              successMessage: "Thanks - our team will reply within one working day.",
            }),
          ],
        },
        {
          name: "Contact",
          path: "/contact",
          title: `Contact - ${p.siteName}`,
          description: "Wholesale enquiries, order support and stockists.",
          sections: [
            sec("Contact", {
              eyebrow: "Get in touch",
              title: "Wholesale and support",
              subtitle: "For stockist enquiries include your shop name, city and expected volume.",
              email: p.contact.email || "hello@example.com",
              phone: p.contact.phone,
              address: p.contact.address,
              hours: p.contact.hours || "Mon-Fri, 9:00 - 17:00",
              showForm: true,
              formFields: ["name", "email", "company", "message"],
              formAction: "mailto",
              submitLabel: "Send message",
              successMessage: "Received - we reply to every enquiry.",
              socials: p.socials,
            }),
          ],
        },
      ],
    };
  },
};
