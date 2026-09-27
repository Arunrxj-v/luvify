import type { CSSProperties } from "react";
import type { Link, SiteDocument, SitePage } from "@luvify/shared";
import { RenderContextProvider, type RenderContextValue } from "./context";
import { NavbarSection, FooterSection } from "./components/structure";
import { SectionRenderer } from "./components/sections";
import { normalizeTheme, themeCss } from "./theme";

/** The first visible Navbar anywhere in the document, reused on other pages. */
function findSharedNavbar(document: SiteDocument): { links: Link[]; cta?: { label: string; path: string } } | null {
  for (const page of document.pages) {
    for (const section of page.sections) {
      if (section.type === "Navbar" && section.visible) {
        return {
          links: section.links.length > 0 ? section.links : document.navigation,
          ...(section.cta ? { cta: section.cta } : {}),
        };
      }
    }
  }
  return null;
}

export function buildRenderContext(document: SiteDocument, page: SitePage): RenderContextValue {
  return {
    siteName: document.siteName,
    tagline: document.tagline,
    contact: document.contact,
    navigation: document.navigation,
    pages: document.pages.map((entry) => ({ name: entry.name, path: entry.path })),
    currentPath: page.path,
    sharedNavbar: findSharedNavbar(document),
  };
}

/**
 * A complete page: theme wrapper, navbar, every visible section and the
 * document-level footer. Used by both the preview iframe and the static export,
 * so what a user edits is exactly what gets published.
 */
export function PageView({ document, page }: { document: SiteDocument; page: SitePage }) {
  const theme = normalizeTheme(document.theme);
  const { attributes, variables } = themeCss(theme);
  const context = buildRenderContext(document, page);
  const hasOwnNavbar = page.sections.some((section) => section.type === "Navbar" && section.visible);
  const { id: _id, visible: _footerVisible, type: _type, ...footerProps } = document.footer;

  return (
    <RenderContextProvider value={context}>
      <div
        data-lv-site=""
        data-lv-theme={attributes.theme}
        data-lv-buttons={attributes.buttons}
        data-lv-spacing={attributes.spacing}
        style={variables as CSSProperties}
      >
        {!hasOwnNavbar && context.sharedNavbar ? (
          <NavbarSection
            logoText={document.siteName}
            logoImageUrl=""
            links={context.sharedNavbar.links}
            {...(context.sharedNavbar.cta ? { cta: context.sharedNavbar.cta } : {})}
            style="solid"
            sticky
          />
        ) : null}

        {page.sections.map((section) => (
          <SectionRenderer key={section.id} section={section} />
        ))}

        {document.footer.visible ? <FooterSection {...footerProps} /> : null}
      </div>
    </RenderContextProvider>
  );
}
