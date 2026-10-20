/**
 * Brief + assets: the config-driven "Content & assets" model.
 *
 * The contract these tests pin down:
 *   * the brief is DATA - every domain resolves its groups from shared config;
 *   * fold/unfold roundtrip - generation sees brief values, storage never does;
 *   * checklist honesty - required-and-empty is Missing, phone covers email;
 *   * CSV/asset plumbing - parse, map, classify, never invent;
 *   * hydration - real uploads reach real slots, deleted assets are scrubbed,
 *     and client-provided people replace the template's invented team.
 */
import { describe, expect, it } from "vitest";
import {
  ALLOWED_CONTENT_TYPES,
  BRIEF_DOMAIN_OPTIONS,
  ProjectBriefSchema,
  addSection,
  briefChecklist,
  briefDomainLabel,
  briefKnownFacts,
  buildProjectKnowledge,
  classifyAsset,
  createPlaceholderSection,
  createSiteFromTemplate,
  detectBriefDomain,
  detectContentType,
  emptyBrief,
  emptyBriefItem,
  emptyRequirements,
  foldBrief,
  getPage,
  hydrateDocument,
  isRenderableImage,
  mapCollectionRows,
  parseDelimited,
  resolveBriefDomain,
  resolveBriefGroups,
  storageNameFor,
  unfoldBrief,
  type BriefChecklist,
  type ClientAsset,
  type ProjectBrief,
  type Requirements,
  type SiteDocument,
} from "../src";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBrief(patch: Partial<ProjectBrief>): ProjectBrief {
  return ProjectBriefSchema.parse({ ...emptyBrief(), ...patch });
}

function restaurantRequirements(): Requirements {
  const requirements = emptyRequirements();
  requirements.business.name = "Kerala Coffee Co.";
  requirements.business.description =
    "A speciality coffee roastery and all-day cafe serving South Indian breakfast in Kochi.";
  requirements.website.type = "restaurant";
  return requirements;
}

const MENU_ROWS: Array<Record<string, string>> = [
  { name: "Kerala Beef Fry", description: "Slow-cooked with coconut", price: "₹480", category: "Mains", diet: "Spicy" },
  { name: "Filter Coffee", description: "Single-origin, brewed to order", price: "₹120", category: "Drinks" },
];

function asset(
  id: string,
  filename: string,
  kind: ClientAsset["kind"],
  category = "",
): ClientAsset {
  return {
    id,
    url: `http://localhost:4000/api/projects/proj-1/assets/${id}`,
    kind,
    category,
    filename,
    alt: "",
  };
}

function checklistItem(checklist: BriefChecklist, id: string) {
  for (const group of checklist.groups) {
    for (const item of group.items) if (item.id === id) return item;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Configuration is data, not 17 hard-coded pages
// ---------------------------------------------------------------------------

describe("brief domain configuration", () => {
  it("every domain resolves a non-empty group list from shared config", () => {
    expect(BRIEF_DOMAIN_OPTIONS.length).toBeGreaterThanOrEqual(17);
    for (const option of BRIEF_DOMAIN_OPTIONS) {
      const groups = resolveBriefGroups(option.id);
      expect(groups.length, `${option.id} has no groups`).toBeGreaterThan(0);
      for (const group of groups) {
        expect(group.id).toBeTruthy();
        expect(group.title).toBeTruthy();
      }
      // Shared groups always follow the domain's own groups.
      expect(groups.some((group) => group.id === "contact")).toBe(true);
    }
  });

  it("the restaurant domain leads with a menu collection", () => {
    const groups = resolveBriefGroups("restaurant");
    const menuGroup = groups.find((group) => group.id === "menu-group");
    expect(menuGroup).toBeTruthy();
    const menu = menuGroup?.collections?.find((collection) => collection.id === "menu");
    expect(menu?.required).toBe(true);
    expect(menu?.fields.some((field) => field.id === "price")).toBe(true);
    expect(briefDomainLabel("restaurant")).toBe("Restaurant / cafe");
    expect(briefDomainLabel("nope")).toBe("Other business");
  });

  it("detection prefers the explicit website type, then keyword coverage", () => {
    const explicit = emptyRequirements();
    explicit.website.type = "restaurant";
    expect(detectBriefDomain(explicit)).toBe("restaurant");

    const keyworded = emptyRequirements();
    keyworded.business.industry = "Vegan cafe and roastery";
    expect(detectBriefDomain(keyworded)).toBe("restaurant");

    const nothing = emptyRequirements();
    expect(detectBriefDomain(nothing)).toBe("business");

    // An explicit brief domain wins over detection.
    expect(resolveBriefDomain(makeBrief({ domain: "hotel" }), keyworded).id).toBe("hotel");
  });
});

// ---------------------------------------------------------------------------
// Fold / unfold - generation sees the brief, storage never does
// ---------------------------------------------------------------------------

describe("foldBrief / unfoldBrief", () => {
  const base = restaurantRequirements();
  const brief = makeBrief({
    domain: "restaurant",
    fields: {
      brand: { name: "Kerala Coffee Co." },
      business: { description: "A cafe that also roasts its own beans." },
      contact: { email: "hello@keralacoffee.co", hours: "Mon-Sun 7:00-22:00" },
    },
    collections: { menu: MENU_ROWS },
  });

  it("fills what the interview left empty and keeps interview values", () => {
    const folded = foldBrief(base, brief);

    expect(folded.content.contact.email).toBe("hello@keralacoffee.co");
    expect(folded.content.contact.hours).toBe("Mon-Sun 7:00-22:00");
    expect(folded.branding.brandName).toBe("Kerala Coffee Co.");
    // Fill-if-empty: the interview's own description survives.
    expect(folded.business.description).toBe(base.business.description);
  });

  it("appends menu rows to their structural carrier with prices intact", () => {
    const folded = foldBrief(base, brief);
    const names = folded.content.services.map((service) => service.name);
    expect(names).toContain("Kerala Beef Fry");
    expect(names).toContain("Filter Coffee");
    expect(folded.content.services.find((service) => service.name === "Kerala Beef Fry")?.price).toBe("₹480");
    // Nothing else was invented: the carrier only grew by the two supplied rows.
    expect(folded.content.services).toHaveLength(base.content.services.length + 2);
  });

  it("roundtrips: unfoldBrief(foldBrief(x), x) deep-equals x", () => {
    const folded = foldBrief(base, brief);
    expect(unfoldBrief(folded, base)).toEqual(base);
  });

  it("deleting brief data later cannot leave ghosts in stored requirements", () => {
    // Save time: the brief rows are gone but the requirements are the same base.
    const emptied = makeBrief({ domain: "restaurant", fields: {}, collections: {} });
    const stored = unfoldBrief(foldBrief(base, brief), base);
    const refolded = foldBrief(stored, emptied);
    expect(refolded.content.services).toEqual(base.content.services);
    expect(refolded.content.contact.email).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Known facts - what the model may quote without a structural carrier
// ---------------------------------------------------------------------------

describe("briefKnownFacts", () => {
  it("includes unmapped fields and non-core collection columns, skips carried values", () => {
    const requirements = restaurantRequirements();
    const brief = makeBrief({
      domain: "restaurant",
      fields: {
        contact: { email: "hello@keralacoffee.co", whatsapp: "+91 98470 00000" },
      },
      collections: { menu: MENU_ROWS },
    });

    const facts = briefKnownFacts(brief, requirements);
    const joined = facts.join("\n");

    expect(joined).toContain("WhatsApp: +91 98470 00000");
    expect(joined).toContain("Menu item: Kerala Beef Fry");
    expect(joined).toContain("Dietary note: Spicy");
    // Structural carriers are NOT duplicated as facts...
    expect(joined).not.toContain("hello@keralacoffee.co");
    // ...and core columns (name/price for services) are represented by the
    // item line, not re-emitted as free facts.
    expect(joined).not.toContain("₹480");
  });

  it("feeds extra facts straight into the knowledge builder", () => {
    const knowledge = buildProjectKnowledge(emptyRequirements(), {
      projectId: "",
      extraFacts: ["Menu item: Kerala Beef Fry - Price: ₹480"],
    });
    expect(knowledge.knownFacts).toContain("Menu item: Kerala Beef Fry - Price: ₹480");
  });
});

// ---------------------------------------------------------------------------
// Checklist - "what does Luvify still need from me?"
// ---------------------------------------------------------------------------

describe("briefChecklist", () => {
  const requirements = restaurantRequirements();

  it("reports required-and-empty as missing, never blocks the rest", () => {
    const checklist = briefChecklist(makeBrief({ domain: "restaurant" }), requirements);
    expect(checklist.ready).toBe(false);
    expect(checklist.missingLabels).toContain("Menu");
    expect(checklist.missingLabels).toContain("Contact email");
    expect(checklistItem(checklist, "menu-group.menu")?.state).toBe("missing");
    // Business description comes from the interview - provided without the brief.
    expect(checklistItem(checklist, "business.description")?.state).toBe("provided");
    // Optional items are counted but never demanded.
    expect(checklist.optional).toBeGreaterThan(0);
  });

  it("turns provided when menu + contact land, and phone covers the email slot", () => {
    const brief = makeBrief({
      domain: "restaurant",
      fields: { contact: { phone: "+91 484 000 0000" } },
      collections: { menu: MENU_ROWS },
    });
    const checklist = briefChecklist(brief, requirements);

    expect(checklistItem(checklist, "menu-group.menu")?.state).toBe("provided");
    expect(checklistItem(checklist, "contact.email")?.state).toBe("provided");
    expect(checklist.ready).toBe(true);
    expect(checklist.missing).toBe(0);
    expect(checklist.provided).toBeGreaterThanOrEqual(3);
  });

  it("counts uploaded files against their slots", () => {
    const brief = makeBrief({
      domain: "restaurant",
      fields: { contact: { email: "hello@keralacoffee.co" } },
      collections: { menu: MENU_ROWS },
    });
    const checklist = briefChecklist(brief, requirements, { "media.hero": 2 });
    expect(checklistItem(checklist, "media.hero")?.state).toBe("provided");
    expect(checklist.ready).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Asset classification + delimited parsing
// ---------------------------------------------------------------------------

describe("asset classification", () => {
  it("classifies by filename and type only - no image recognition", () => {
    expect(classifyAsset("logo.png", "image/png")).toBe("LOGO");
    expect(classifyAsset("menu.pdf", "application/pdf")).toBe("MENU");
    expect(classifyAsset("IMG_0001.jpg", "image/jpeg")).toBe("PHOTO");
    expect(classifyAsset("clip.mp4", "video/mp4")).toBe("VIDEO");
    expect(classifyAsset("export.csv", "text/csv")).toBe("DATA");
    expect(classifyAsset("contract.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("DOCUMENT");
  });

  it("sniffs magic bytes, falls back to the extension", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(detectContentType("mystery.bin", png)).toBe("image/png");

    const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj");
    expect(detectContentType("scan.bin", pdf)).toBe("application/pdf");

    expect(detectContentType("logo.svg")).toBe("image/svg+xml");

    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(detectContentType("brandmark", svg)).toBe("image/svg+xml");
  });

  it("storage names are server-generated id + canonical extension", () => {
    expect(storageNameFor("abc123", "My Menu.PDF", "application/pdf")).toBe("abc123.pdf");
    expect(storageNameFor("abc123", "photo.JPEG", "image/jpeg")).toBe("abc123.jpeg");
    expect(ALLOWED_CONTENT_TYPES.has("image/png")).toBe(true);
    expect(isRenderableImage("image/png")).toBe(true);
    expect(isRenderableImage("application/pdf")).toBe(false);
  });
});

describe("parseDelimited", () => {
  it("parses quoted CSV, keeping embedded commas and escaped quotes", () => {
    const text = '"Dish, special",Price,Note\n"Masala, Dosa",₹250,"he said ""hi"""\n';
    const parsed = parseDelimited(text);
    expect(parsed.columns).toEqual(["Dish, special", "Price", "Note"]);
    expect(parsed.rows).toEqual([
      { "Dish, special": "Masala, Dosa", Price: "₹250", Note: 'he said "hi"' },
    ]);
  });

  it("detects tab-separated files and CRLF endings", () => {
    const parsed = parseDelimited("Name\tPrice\r\nDosa\t₹250\r\n");
    expect(parsed.columns).toEqual(["Name", "Price"]);
    expect(parsed.rows[0]).toEqual({ Name: "Dosa", Price: "₹250" });
  });

  it("caps runaway files at 500 rows", () => {
    const rows = Array.from({ length: 600 }, (_, index) => `item-${index},${index}`);
    const parsed = parseDelimited(["name,price", ...rows].join("\n"));
    expect(parsed.rows.length).toBe(500);
    expect(parsed.columns).toEqual(["name", "price"]);
  });
});

describe("mapCollectionRows", () => {
  const menu = resolveBriefGroups("restaurant")
    .flatMap((group) => group.collections ?? [])
    .find((collection) => collection.id === "menu");
  if (!menu) throw new Error("restaurant menu collection missing");

  it("maps real-world headers onto collection fields", () => {
    const columns = ["Dish", "Unit price", "Section", "Dietary note"];
    const rows: Array<Record<string, string>> = [
      { Dish: "Masala Dosa", "Unit price": "₹250", Section: "Mains", "Dietary note": "Vegan" },
      { Dish: "", "Unit price": "₹999" }, // no required name -> skipped
      { Dish: "   " },
    ];
    const items = mapCollectionRows(menu, columns, rows);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      name: "Masala Dosa",
      price: "₹250",
      category: "Mains",
      diet: "Vegan",
    });
  });

  it("matches by exact field id, label and alias alike", () => {
    const byId = mapCollectionRows(menu, ["name", "price"], [{ name: "Dosa", price: "₹120" }]);
    const byLabel = mapCollectionRows(menu, ["Dish name", "Price"], [{ "Dish name": "Dosa", Price: "₹120" }]);
    expect(byId[0]?.name).toBe("Dosa");
    expect(byLabel[0]?.price).toBe("₹120");
    expect(emptyBriefItem(menu)).toEqual({
      name: "",
      description: "",
      price: "",
      category: "",
      diet: "",
    });
  });

  it("knows which headers to suggest in the UI", () => {
    expect(menu.csvHeaders).toContain("name");
    expect(menu.csvHeaders).toContain("price");
  });
});

// ---------------------------------------------------------------------------
// Hydration - stored files become site images
// ---------------------------------------------------------------------------

describe("hydrateDocument", () => {
  const restaurantDoc = (): SiteDocument =>
    createSiteFromTemplate("restaurant", { siteName: "Kerala Coffee Co." }, { provider: "test" });

  it("fills logo, hero and gallery from the project's own uploads", () => {
    const doc = restaurantDoc();
    const out = hydrateDocument(doc, {
      assets: [
        asset("logo1", "logo.png", "LOGO", "brand.logo"),
        asset("hero1", "cafe-hero.png", "PHOTO", "media.hero"),
        asset("extra1", "counter.png", "PHOTO", "media.gallery"),
      ],
    });

    const navbar = getPage(out, "/")?.sections.find((section) => section.type === "Navbar");
    expect(navbar && navbar.type === "Navbar" ? navbar.logoImageUrl : null).toBe(
      "http://localhost:4000/api/projects/proj-1/assets/logo1",
    );

    const hero = getPage(out, "/")?.sections.find((section) => section.type === "Hero");
    expect(hero && hero.type === "Hero" ? hero.image?.url : null).toBe(
      "http://localhost:4000/api/projects/proj-1/assets/hero1",
    );

    // With no supply left the gallery stays empty - nothing is ever invented.
    const gallery = getPage(out, "/gallery")?.sections.find((section) => section.type === "Gallery");
    const images = gallery && gallery.type === "Gallery" ? gallery.images : [];
    expect(images.length).toBeLessThanOrEqual(1);
  });

  it("matches product photos by filename <-> product name", () => {
    const requirements = emptyRequirements();
    requirements.content.products = [
      { name: "Masala Dosa", description: "Rice cakes, coconut chutney", price: "₹250", category: "Mains" },
    ];
    const doc = createSiteFromTemplate(
      "ecommerce",
      { siteName: "Test Kitchen", requirements },
      { provider: "test" },
    );
    const out = hydrateDocument(doc, {
      assets: [
        asset("hero1", "shop-hero.png", "PHOTO", "media.hero"),
        asset("about1", "kitchen.png", "PHOTO"),
        asset("prod1", "masala-dosa-hero.png", "PHOTO"),
        asset("prod2", "masala-dosa.png", "PHOTO"),
      ],
    });

    const imageUrls: Array<string | undefined> = [];
    for (const page of out.pages) {
      for (const section of page.sections) {
        if (section.type === "Products" || section.type === "ProductGrid") {
          for (const item of section.items) imageUrls.push(item.imageUrl);
        }
      }
    }
    expect(imageUrls.length).toBeGreaterThan(0);
    expect(imageUrls.every((url) => Boolean(url))).toBe(true);
  });

  it("replaces the template's invented team with the client's people", () => {
    const doc = restaurantDoc();
    const withTeam = addSection(doc, "/", createPlaceholderSection("Team", { siteName: "Kerala Coffee Co." }));
    const placeholder = getPage(withTeam, "/")?.sections.find((section) => section.type === "Team");
    expect(placeholder && placeholder.type === "Team" ? placeholder.members[0]?.name : null).toBe(
      "Team member",
    );

    const out = hydrateDocument(withTeam, {
      assets: [],
      team: [{ name: "Asha Nair", role: "Head chef", bio: "Runs the kitchen since 2012" }],
    });
    const team = getPage(out, "/")?.sections.find((section) => section.type === "Team");
    const members = team && team.type === "Team" ? team.members : [];
    expect(members).toHaveLength(1);
    expect(members[0]?.name).toBe("Asha Nair");
    expect(members[0]?.role).toBe("Head chef");
    expect(members[0]?.bio).toContain("2012");
  });

  it("always clears references to deleted assets, and only fills when asked", () => {
    const doc = restaurantDoc();
    const heroPhoto = asset("hero1", "cafe-hero.png", "PHOTO", "media.hero");

    const filled = hydrateDocument(doc, { assets: [heroPhoto] });
    expect(JSON.stringify(filled)).toContain("/assets/hero1");

    // The asset was deleted: the slot becomes an honest placeholder again.
    const scrubbed = hydrateDocument(filled, { assets: [] });
    expect(JSON.stringify(scrubbed)).not.toContain("/assets/hero1");

    // Clear-only mode (delete scrub) never adds anything new.
    const clearOnly = hydrateDocument(doc, { assets: [heroPhoto], fill: false });
    expect(JSON.stringify(clearOnly)).not.toContain("/assets/hero1");
  });
});
