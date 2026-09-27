import { groundCopy, mergeTheme, personalize, sec, type SiteTemplate } from "./context";

export const saasTemplate: SiteTemplate = {
  id: "saas",
  name: "SaaS product",
  description: "Product marketing site with feature grid, pricing plans, FAQs and trial CTAs.",
  bestFor: "Software products, apps, developer tools, B2B platforms",
  websiteType: "saas",
  swatch: { primary: "#4f46e5", accent: "#22d3ee", background: "#ffffff" },
  create(context) {
    const p = personalize(context);
    const theme = mergeTheme(
      {
        style: "modern",
        radius: 12,
        buttonStyle: "solid",
        colors: {
          primary: "#4f46e5",
          secondary: "#0b1220",
          accent: "#22d3ee",
          background: "#ffffff",
          surface: "#f6f7fb",
          foreground: "#0b1220",
          muted: "#5b6478",
          border: "#e4e7ef",
        },
        fonts: { heading: "Sora", body: "Inter" },
      },
      context,
    );

    const features = p.services.length
      ? p.services.map((service) => ({ title: service.title, description: service.description, icon: "" }))
      : [
          { title: "Ship in minutes", description: "Connect your repo and deploy a working product tour before your standup ends.", icon: "" },
          { title: "Usage analytics", description: "See which accounts convert, which churn and why - without a data team.", icon: "" },
          { title: "Automations", description: "Trigger onboarding, alerts and invoices from real product events.", icon: "" },
          { title: "Enterprise ready", description: "SSO, audit logs, role-based access and regional data residency.", icon: "" },
          { title: "Open API", description: "Every screen is backed by a documented REST and webhook API surface.", icon: "" },
          { title: "Human support", description: "Median first response of 4 minutes from engineers, not scripts.", icon: "" },
        ];

    return {
      siteName: p.siteName,
      tagline: p.tagline || "The fastest way to turn product data into revenue",
      theme,
      contact: p.contact,
      socials: p.socials,
      pages: [
        {
          name: "Home",
          path: "/",
          title: `${p.siteName} - product analytics for teams that ship`,
          description: p.seoDescription || `${p.siteName} helps product teams understand usage, reduce churn and grow revenue.`,
          sections: [
            sec("Navbar", {
              logoText: p.siteName,
              links: [
                { label: "Product", path: "/#features" },
                { label: "Pricing", path: "/pricing" },
                { label: "Docs", path: "/about" },
                { label: "Contact", path: "/contact" },
              ],
              cta: { label: "Start free", path: "/contact" },
            }),
            sec("Hero", {
              eyebrow: "New: revenue attribution",
              title: p.headline || groundCopy({
                offerings: p.offerings,
                facts: p.productSummary ? [p.productSummary] : [],
                fallback: "Know exactly why customers stay, churn or upgrade",
              }) || "Know exactly why customers stay, churn or upgrade",
              subtitle: groundCopy({
                client: p.subheadline,
                offerings: p.offerings,
                fallback:
                  "Connect your product in one afternoon. Get cohort analytics, churn alerts and revenue attribution your whole team can act on.",
              }),
              primaryCta: { label: "Start free - 14 days", path: "/contact" },
              secondaryCta: { label: "See pricing", path: "/pricing" },
              size: "standard",
              ...(p.productSummary || p.subheadline
                ? {}
                : {
                    stats: [
                      { value: "4 min", label: "Median support reply" },
                      { value: "99.98%", label: "Uptime last year" },
                      { value: "12k+", label: "Teams onboarded" },
                    ],
                  }),
              trustLine: p.productSummary || p.subheadline ? "" : "No credit card. SOC 2 Type II. Cancel anytime.",
            }),
            sec("Features", {
              eyebrow: "Product",
              title: "Everything you need to understand retention",
              subtitle: "Built for teams without a dedicated data engineer.",
              columns: 3,
              items: features,
            }),
            sec("CTA", {
              title: "Set up your first report this week",
              body: "Our onboarding team migrates your existing dashboards for free on annual plans.",
              button: { label: "Book a walkthrough", path: "/contact" },
              secondaryButton: { label: "Read the docs", path: "/about" },
              variant: "solid",
            }),
            sec("Testimonials", {
              title: "Teams that switched",
              items: p.testimonials.length
                ? p.testimonials
                : [
                    { quote: "We cut our churn reporting from two days to two minutes.", author: "Amara O.", role: "Head of Product, Fintech", rating: 5 },
                    { quote: "The alerts caught a broken onboarding step before our support queue did.", author: "Tom B.", role: "CTO, Logistics platform", rating: 5 },
                  ],
            }),
            ...(p.faq.length
              ? [
                  sec("FAQ", {
                    title: "Common questions",
                    items: p.faq,
                  }),
                ]
              : []),
          ],
        },
        {
          name: "Pricing",
          path: "/pricing",
          title: `Pricing - ${p.siteName}`,
          description: "Transparent plans with a 14-day free trial and usage-based scaling.",
          sections: [
            sec("Pricing", {
              eyebrow: "Pricing",
              title: "Pay for what you actually use",
              subtitle: "Every plan includes unlimited seats, SSO-lite and email support.",
              currency: "USD",
              note: "Annual billing saves 20%. Prices exclude tax.",
              plans: [
                {
                  name: "Starter",
                  price: "0",
                  period: "per month",
                  description: "For side projects and evaluations.",
                  features: ["1 million events", "3 dashboards", "7-day history", "Community support"],
                  cta: { label: "Start free", path: "/contact" },
                },
                {
                  name: "Scale",
                  price: "149",
                  period: "per month",
                  description: "For product teams running weekly experiments.",
                  features: ["25 million events", "Unlimited dashboards", "12-month history", "SAML SSO", "Slack + webhook alerts", "Priority support"],
                  cta: { label: "Start 14-day trial", path: "/contact" },
                  highlighted: true,
                },
                {
                  name: "Enterprise",
                  price: "Custom",
                  period: "",
                  description: "For regulated and high-volume organisations.",
                  features: ["Unlimited events", "Self-hosting option", "Audit logs + RBAC", "Data residency", "99.99% uptime SLA", "Named engineer"],
                  cta: { label: "Talk to sales", path: "/contact" },
                },
              ],
            }),
            sec("FAQ", {
              title: "Billing questions",
              items: [
                { question: "What happens after the trial?", answer: "You keep read-only access for 30 days. No automatic charges without your approval." },
                { question: "Can we change plans mid-cycle?", answer: "Yes - upgrades are prorated instantly, downgrades apply at the next renewal." },
              ],
            }),
          ],
        },
        {
          name: "How it works",
          path: "/about",
          title: `How ${p.siteName} works`,
          description: "Architecture, security posture and the implementation timeline.",
          sections: [
            sec("About", {
              eyebrow: "Under the hood",
              title: "Streaming ingestion with a warehouse-grade history",
              body: p.about.length
                ? p.about
                : [
                    "Events stream in through a regional edge endpoint and land in your workspace within two seconds.",
                    "Cohorts are computed incrementally, so retention charts stay fast even at billions of events.",
                  ],
              imagePosition: "right",
              highlights: ["GDPR & SOC 2", "EU/US/APAC regions", "PII redaction at ingest"],
            }),
            sec("Features", {
              title: "Built for scale",
              columns: 3,
              items: [
                { title: "2s ingestion", description: "Edge endpoints in 14 regions." },
                { title: "SQL access", description: "Query raw events with your own BI tools." },
                { title: "Versioned API", description: "No breaking changes without 12 months notice." },
              ],
            }),
          ],
        },
        {
          name: "Contact",
          path: "/contact",
          title: `Start your trial - ${p.siteName}`,
          description: "Talk to the team, request a demo or start a self-serve trial.",
          sections: [
            sec("Contact", {
              title: "Start your free trial",
              subtitle: "Tell us about your stack - we will send setup instructions and a sandbox key.",
              email: p.contact.email || "hello@example.com",
              phone: p.contact.phone,
              address: p.contact.address,
              showForm: true,
              formFields: ["name", "email", "company", "message"],
              formAction: "mailto",
              submitLabel: "Request trial access",
              successMessage: "Thanks - check your inbox for sandbox credentials within one business day.",
            }),
          ],
        },
      ],
    };
  },
};
