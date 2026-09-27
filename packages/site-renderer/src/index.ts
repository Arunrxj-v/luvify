/**
 * @luvify/site-renderer - turns a validated `SiteDocument` into a website.
 *
 * The same components back the editor's live preview (React) and the published
 * snapshot (`renderToStaticMarkup`), so what a user edits is exactly what ships.
 * Sections only ever receive the Zod-inferred props from `@luvify/shared`, so an
 * AI-generated document can influence content but never markup structure.
 */

export { SITE_CSS } from "./styles";

export {
  escapeHtml,
  jsonForScript,
  safeExternalUrl,
  safeRelativeUrl,
} from "./html";

export {
  normalizeTheme,
  themeCss,
  themeFontHref,
  themeVariables,
  themeVariablesCss,
  type ThemeCss,
} from "./theme";

export {
  RenderContextProvider,
  useRenderContext,
  type RenderContextValue,
} from "./context";

export {
  Avatar,
  ButtonLink,
  EmptyState,
  ImageFrame,
  Link,
  SectionHeading,
  Stars,
  cx,
  isExternal,
  priceLabel,
  safeImageUrl,
  safeMapEmbedUrl,
  safeUrl,
  textColorFor,
} from "./primitives";

export { SectionRenderer, SectionList } from "./components/sections";

export { normalizePath as normalizeSitePath, relativePageHref, resolveInternalLink, type ResolvedInternalLink } from "./paths";
export { NavbarSection, FooterSection } from "./components/structure";
export { HeroSection, FeaturesSection } from "./components/hero";
export { AboutSection, FaqSection, GallerySection, ServicesSection } from "./components/content";
export { BlogSection, TeamSection, TestimonialsSection } from "./components/editorial";
export {
  PricingSection,
  ProductCardSection,
  ProductGridSection,
  ProductsSection,
} from "./components/commerce";
export { ContactSection, CtaSection } from "./components/convert";

export { PageView, buildRenderContext } from "./render";

export {
  exportSite,
  findPage,
  normalizePath,
  pageFilePath,
  renderPageHtml,
  renderPreview,
  renderRobots,
  renderSiteCss,
  renderSiteFiles,
  renderSitemap,
  type ExportOptions,
  type RenderOptions,
} from "./static";