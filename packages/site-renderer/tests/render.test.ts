import { describe, expect, it } from "vitest";
import {
  SECTION_TYPES,
  RequirementsSchema,
  createPlaceholderSection,
  createSiteFromTemplate,
  emptyRequirements,
  type Requirements,
  type SiteDocument,
  type Section,
  type TemplateId,
} from "@luvify/shared";
import {
  exportSite,
  escapeHtml,
  findPage,
  jsonForScript,
  normalizePath,
  normalizeTheme,
  pageFilePath,
  relativePageHref,
  renderPageHtml,
  renderPreview,
  renderRobots,
  renderSiteCss,
  renderSiteFiles,
  renderSitemap,
  resolveInternalLink,
  safeExternalUrl,
  safeImageUrl,
  safeMapEmbedUrl,
  safeRelativeUrl,
  safeUrl,
  themeVariables,
  themeVariablesCss,
} from "../src";

const TEMPLATE_IDS: TemplateId[] = ["saas", "restaurant", "portfolio", "agency", "ecommerce", "personal"];

const CONTACT = {
  email: "hello@riverside.test",
  phone: "+44 20 7946 0000",
  address: "12 Mill Lane, London",
  hours: "Mon-Fri 9-5",
  whatsapp: "447946000000",
};

/** A real document, built through the same registry the API uses. */
function buildRequirements(): Requirements {
  const base = emptyRequirements("business");
  // Grounded requirements: every gated section (testimonials, pricing, team,
  // FAQ, blog) has verified client information behind it, so templates emit
  // their full section range and validation keeps it.
  return RequirementsSchema.parse({
    ...base,
    business: {
      ...base.business,
      name: "Riverside Dental",
      description: "A family dental practice in London offering check-ups and whitening.",
      productSummary: "A family dental practice offering check-ups and whitening.",
      offerings: ["check-ups", "whitening"],
      targetAudience: "families",
    },
    website: { ...base.website, type: "business", requiredPages: ["Home", "Team", "Contact"] },
    content: {
      ...base.content,
      headline: "Gentle dentistry for the whole family",
      about: "We are a family dental practice in London.",
      services: [{ name: "Check-up", description: "Routine examination.", price: "£45" }],
      testimonials: [{ quote: "Painless and friendly.", author: "Sam", role: "Patient" }],
      faq: [{ question: "Do you take new patients?", answer: "Yes, book online." }],
    },
    features: { ...base.features, blog: true, reviewed: true },
  });
}

function buildDocument(template: TemplateId = "saas"): SiteDocument {
  return createSiteFromTemplate(
    template,
    { siteName: "Riverside Dental", tagline: "Gentle dentistry for the whole family", contact: CONTACT, requirements: buildRequirements() },
    { provider: "mock", completeness: 90 },
  );
}

/**
 * `createPlaceholderSection` returns the whole `Section` union, so a test that
 * wants to assert on rendered text has to narrow to a titled section first.
 */
function titledSection(type: "Hero" | "Features"): { section: Section; title: string } {
  const section = createPlaceholderSection(type, { siteName: "Acme" });
  if (!("title" in section)) throw new Error(`${type} has no title`);
  return { section, title: section.title };
}

const homeHtml = (doc: SiteDocument, options: Parameters<typeof renderPageHtml>[2] = {}): string =>
  renderPageHtml(doc, doc.pages[0]!, options);

/** A document whose page contains exactly the given sections. */
function withSections(doc: SiteDocument, sections: ReturnType<typeof createPlaceholderSection>[]): string {
  const page = { ...doc.pages[0]!, sections };
  return renderPageHtml({ ...doc, pages: [page] }, page);
}

describe("section coverage", () => {
  it("renders every section type in the shared registry", () => {
    // The dispatcher is an exhaustive switch, which only proves the type system
    // is satisfied. This proves every branch actually produces markup.
    const doc = buildDocument();
    for (const type of SECTION_TYPES) {
      const html = withSections(doc, [createPlaceholderSection(type, { siteName: "Acme" })]);
      expect(html, `section type ${type} produced no markup`).toContain("lv-container");
    }
  });

  it("covers the two types no template emits", () => {
    const emitted = new Set<string>();
    for (const id of TEMPLATE_IDS) {
      for (const page of buildDocument(id).pages) {
        for (const section of page.sections) emitted.add(section.type);
      }
    }
    expect(SECTION_TYPES.filter((type) => !emitted.has(type))).toEqual(["ProductCard", "Footer"]);
  });

  it("omits sections marked invisible", () => {
    const doc = buildDocument();
    const shown = titledSection("Hero");
    const hidden = titledSection("Features");
    const html = withSections(doc, [{ ...hidden.section, visible: false }, shown.section]);
    expect(html).toContain(shown.title);
    expect(html).not.toContain(hidden.title);
  });
});

describe("page composition", () => {
  it("emits a complete HTML document with the theme hook", () => {
    const html = homeHtml(buildDocument());
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("data-lv-site=");
    expect(html).toContain('data-lv-theme="light"');
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("reuses the home page navbar on pages that do not define their own", () => {
    const doc = buildDocument();
    const secondary = doc.pages.find((page) => page.path === "/about");
    expect(secondary, "saas template should have an /about page").toBeDefined();
    const html = renderPageHtml(doc, secondary!);
    expect(html.match(/class="lv-nav"/g) ?? []).toHaveLength(1);
  });

  it("does not add a second navbar when the page already has one", () => {
    const doc = buildDocument();
    const html = homeHtml(doc);
    expect(html.match(/class="lv-nav"/g) ?? []).toHaveLength(1);
  });

  it("renders the document footer once, on every page", () => {
    const doc = buildDocument();
    for (const page of doc.pages) {
      const html = renderPageHtml(doc, page);
      expect(html.match(/class="lv-footer"/g) ?? [], `page ${page.path}`).toHaveLength(1);
    }
  });

  it("honours the lang option", () => {
    expect(homeHtml(buildDocument(), { lang: "fr" })).toContain('<html lang="fr">');
  });
});

describe("templates", () => {
  it("renders every shipped template without throwing", () => {
    for (const id of TEMPLATE_IDS) {
      const doc = buildDocument(id);
      expect(doc.pages.length, `${id} has no pages`).toBeGreaterThan(0);
      for (const page of doc.pages) {
        const html = renderPageHtml(doc, page);
        expect(html, `${id} ${page.path} rendered no site wrapper`).toContain("data-lv-site");
        expect(html).toContain("</html>");
      }
    }
  });

  it("fills in the contact details from the document", () => {
    expect(homeHtml(buildDocument())).toContain("hello@riverside.test");
  });
});

describe("escaping and URL sanitisation", () => {
  it("escapes markup coming from document text", () => {
    const doc = buildDocument();
    const page = { ...doc.pages[0]!, title: '</title><script>alert("x")</script>' };
    const html = renderPageHtml(doc, page);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rejects javascript:, data: and protocol-relative links", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("  JaVaScRiPt:alert(1)")).toBe("");
    expect(safeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe("");
    expect(safeUrl("//evil.test/path")).toBe("");
    expect(safeUrl("https://ok.test/page")).toBe("https://ok.test/page");
    expect(safeUrl("/about")).toBe("/about");
  });

  it("limits image sources to http(s), site-relative and raster data URLs", () => {
    expect(safeImageUrl("javascript:alert(1)")).toBe("");
    expect(safeImageUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe("");
    expect(safeImageUrl("https://cdn.test/a.png")).toBe("https://cdn.test/a.png");
    expect(safeImageUrl("/media/a.png")).toBe("/media/a.png");
  });

  it("embeds maps only from known https providers", () => {
    expect(safeMapEmbedUrl("https://www.google.com/maps/embed?pb=1")).toContain("google.com");
    expect(safeMapEmbedUrl("https://evil.test/embed")).toBe("");
    expect(safeMapEmbedUrl("http://www.google.com/maps/embed?pb=1")).toBe("");
    expect(safeMapEmbedUrl("not a url")).toBe("");
  });

  it("escapes the shell helpers", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    expect(jsonForScript({ a: "</script>" })).not.toContain("</script>");
    expect(jsonForScript({ a: "</script>" })).toContain("\\u003c");
  });

  it("only accepts http(s) for external references", () => {
    expect(safeExternalUrl("https://ok.test")).toBe("https://ok.test/");
    expect(safeExternalUrl("javascript:alert(1)")).toBe("");
    expect(safeExternalUrl("")).toBe("");
  });

  it("only accepts single-slash paths for canonical URLs", () => {
    expect(safeRelativeUrl("/about")).toBe("/about");
    expect(safeRelativeUrl("//evil.test")).toBe("");
    expect(safeRelativeUrl("https://evil.test")).toBe("");
  });
});


describe("theme", () => {
  it("emits the validated palette as CSS custom properties", () => {
    const variables = themeVariables(normalizeTheme({ colors: { primary: "#ff0000" }, radius: 8, dark: true }));
    expect(variables["--lv-primary"]).toBe("#ff0000");
    expect(variables["--lv-radius"]).toBe("8px");
    // A red primary needs light text, so contrast is derived rather than authored.
    expect(variables["--lv-primary-contrast"]).toBe("#ffffff");
  });

  it("falls back to defaults for a theme that fails validation", () => {
    // A snapshot written before a schema change must not poison the stylesheet.
    const variables = themeVariables(normalizeTheme({ colors: { primary: "url(javascript:alert(1))" }, radius: 99999 }));
    expect(variables["--lv-primary"]).toMatch(/^#[0-9a-f]{3,8}$/i);
    expect(variables["--lv-radius"]).not.toContain("99999");
  });

  it("never lets a theme value break out of its declaration", () => {
    const hostile = normalizeTheme({ colors: { primary: "red;} body{display:none" }, fonts: { heading: "'Inter';}</style><script>x</script>" } });
    const css = themeVariablesCss(hostile);
    expect(css).not.toContain("<script>");
    expect(css.split("{")).toHaveLength(2);
  });

  it("sets the theme data attributes the stylesheet keys off", () => {
    const html = homeHtml(buildDocument());
    expect(html).toMatch(/data-lv-theme="(light|dark)"/);
    expect(html).toMatch(/data-lv-buttons="(solid|outline|pill|square)"/);
    expect(html).toMatch(/data-lv-spacing="(compact|comfortable|spacious)"/);
  });
});

describe("paths", () => {
  it("normalises trailing slashes, query strings and missing leading slashes", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("about")).toBe("/about");
    expect(normalizePath("/about/")).toBe("/about");
    expect(normalizePath("/about?ref=nav#team")).toBe("/about");
    expect(normalizePath("")).toBe("/");
  });

  it("maps a page path to a nested output file", () => {
    const doc = buildDocument();
    expect(pageFilePath(doc.pages[0]!)).toBe("index.html");
    expect(pageFilePath({ ...doc.pages[0]!, path: "/about" })).toBe("about/index.html");
  });

  it("keeps an escaping path from writing outside the bundle", () => {
    const doc = buildDocument();
    const evil = { ...doc.pages[0]!, path: "/../../etc/passwd" };
    // `..` segments are dropped rather than sanitised away, so the page still
    // renders - it just lands somewhere harmless inside the bundle.
    expect(pageFilePath(evil)).toBe("etc/passwd/index.html");
    for (const path of renderSiteFiles({ ...doc, pages: [evil] }).keys()) {
      expect(path.startsWith("/"), `absolute path ${path}`).toBe(false);
      expect(path.split("/").includes(".."), `escaping path ${path}`).toBe(false);
    }
  });

  it("keeps readable slugs intact while dropping unsafe characters", () => {
    const doc = buildDocument();
    expect(pageFilePath({ ...doc.pages[0]!, path: "/Our-Team/v2" })).toBe("our-team/v2/index.html");
    expect(pageFilePath({ ...doc.pages[0]!, path: "/a b" })).toBe("a-b/index.html");
  });

  it("resolves a page by path, falling back to the first page", () => {
    const doc = buildDocument();
    const first = doc.pages[0]!;
    expect(findPage(doc, first.path).id).toBe(first.id);
    expect(findPage(doc, "/does-not-exist").id).toBe(first.id);
  });
});

describe("static export", () => {
  it("emits one HTML file per page, each with its own stylesheet", () => {
    const doc = buildDocument();
    const files = renderSiteFiles(doc);
    for (const page of doc.pages) {
      const path = pageFilePath(page);
      expect(files.get(path), `missing ${path}`).toContain("<!doctype html>");
      // A nested page links `styles.css` from its own directory.
      const cssPath = `${path.slice(0, path.lastIndexOf("/") + 1)}styles.css`;
      expect(files.get(cssPath), `missing ${cssPath}`).toContain("[data-lv-site]");
    }
  });

  it("links the stylesheet relative to the page instead of inlining it", () => {
    const doc = buildDocument();
    const about = doc.pages.find((page) => page.path === "/about") ?? { ...doc.pages[0]!, path: "/about" };
    const html = renderSiteFiles(doc).get(pageFilePath(about));
    expect(html).toContain('href="styles.css"');
    expect(html).not.toContain("<style>");
  });

  it("writes sitemap and robots only when an origin is known", () => {
    const doc = buildDocument();
    expect(renderSiteFiles(doc).has("sitemap.xml")).toBe(false);
    const withOrigin = renderSiteFiles(doc, { siteUrl: "https://acme.test" });
    expect(withOrigin.get("sitemap.xml")).toContain("https://acme.test/");
    expect(withOrigin.get("robots.txt")).toContain("Sitemap: https://acme.test/sitemap.xml");
    expect(renderSiteFiles(doc, { siteUrl: "https://acme.test", includeSeoFiles: false }).has("sitemap.xml")).toBe(false);
  });

  it("excludes noIndex pages from the sitemap", () => {
    const doc = buildDocument();
    const sitemap = renderSitemap({ ...doc, pages: doc.pages.map((page) => ({ ...page, noIndex: true })) }, { siteUrl: "https://acme.test" });
    expect(sitemap).not.toContain("<url>");
    expect(sitemap).toContain("<urlset");
  });

  it("describes each file with a language for the file store", () => {
    const result = exportSite(buildDocument(), { siteUrl: "https://acme.test", projectName: "riverside" });
    expect(result.projectName).toBe("riverside");
    expect(result.siteName).toBe("Riverside Dental");
    expect(result.versionNumber).toBe(1);
    for (const file of result.files) {
      expect(file.path).not.toMatch(/^(\.\.|\/)/);
      expect(file.content.length).toBeGreaterThan(0);
    }
    expect(result.files.find((file) => file.path === "index.html")?.language).toBe("html");
    expect(result.files.find((file) => file.path === "sitemap.xml")?.language).toBe("xml");
  });
});

describe("preview payload", () => {
  it("matches the shape the editor and /preview endpoint expect", () => {
    const doc = buildDocument();
    const preview = renderPreview(doc, doc.pages[0]!.path);
    expect(preview.page).toBe(doc.pages[0]!.path);
    expect(preview.pageName).toBe(doc.pages[0]!.name);
    expect(preview.title).toBeTruthy();
    expect(preview.versionNumber).toBe(doc.meta.versionNumber);
    expect(preview.pages.map((page) => page.path)).toEqual(doc.pages.map((page) => page.path));
    // The preview iframe inlines the stylesheet so it needs no stylesheet request.
    expect(preview.html).toContain("<style>");
    expect(preview.css).toContain("[data-lv-site]");
  });

  it("adds canonical and Open Graph tags once an origin is given", () => {
    expect(homeHtml(buildDocument(), { siteUrl: "https://acme.test" })).toContain('<link rel="canonical" href="https://acme.test/" />');
    expect(homeHtml(buildDocument(), { siteUrl: "https://acme.test" })).toContain('<meta property="og:title"');
    expect(homeHtml(buildDocument())).not.toContain('rel="canonical"');
  });

  it("marks a noIndex page as such", () => {
    const doc = buildDocument();
    expect(renderPageHtml(doc, { ...doc.pages[0]!, noIndex: true })).toContain('content="noindex, nofollow"');
  });
});

describe("internal links", () => {
  it("builds directory-relative hrefs between pages at any depth", () => {
    expect(relativePageHref("/", "/about")).toBe("about/");
    expect(relativePageHref("/about", "/")).toBe("../");
    expect(relativePageHref("/about", "/services")).toBe("../services/");
    expect(relativePageHref("/", "/")).toBe("./");
    expect(relativePageHref("/services/plan", "/services")).toBe("../");
    expect(relativePageHref("/about", "/about/team")).toBe("team/");
  });

  it("resolves internal hrefs, carrying the query or hash suffix", () => {
    const pages = [{ path: "/" }, { path: "/about" }, { path: "/services" }];
    expect(resolveInternalLink("/services#plans", "/", pages)).toEqual({
      found: true,
      href: "services/#plans",
      path: "/services",
    });
    expect(resolveInternalLink("/about/", "/", pages)).toEqual({
      found: true,
      href: "about/",
      path: "/about",
    });
  });

  it("degrades links to missing pages to # instead of a 404", () => {
    const pages = [{ path: "/" }, { path: "/about" }];
    expect(resolveInternalLink("/does-not-exist", "/", pages)).toEqual({
      found: false,
      href: "#",
      path: "/does-not-exist",
    });
  });

  it("leaves external, mailto, tel and anchor hrefs as authored", () => {
    const pages = [{ path: "/" }, { path: "/about" }];
    expect(resolveInternalLink("https://acme.test/x", "/", pages)).toBeNull();
    expect(resolveInternalLink("//acme.test/x", "/", pages)).toBeNull();
    expect(resolveInternalLink("mailto:hi@acme.test", "/", pages)).toBeNull();
    expect(resolveInternalLink("tel:+441234567890", "/", pages)).toBeNull();
    expect(resolveInternalLink("#team", "/about", pages)).toBeNull();
  });

  it("renders only relative internal hrefs so any base path works", () => {
    const doc = buildDocument();
    for (const page of doc.pages) {
      const html = renderPageHtml(doc, page);
      // A root-absolute internal href breaks under /sites/<slug>/ and on refresh.
      expect(html, `root-absolute internal link on ${page.path}`).not.toMatch(/href="\/(?!\/)/);
      expect(html, `missing resolved-link marker on ${page.path}`).toContain('data-lv-path="');
    }
  });

  it("marks preview documents for intercepted navigation; exports stay plain", () => {
    const doc = buildDocument();
    const preview = renderPreview(doc, doc.pages[0]!.path);
    expect(preview.html).toContain('data-lv-preview="true"');
    expect(preview.html).toContain("lv:navigate");
    expect(homeHtml(doc)).not.toContain('data-lv-preview="true"');
  });
});

