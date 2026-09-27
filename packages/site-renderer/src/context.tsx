import { createContext, useContext, type ReactNode } from "react";
import type { Link, SiteContact } from "@luvify/shared";

/** Ambient data every section can rely on without prop drilling. */
export interface RenderContextValue {
  siteName: string;
  tagline: string;
  contact: SiteContact;
  navigation: Link[];
  pages: Array<{ name: string; path: string }>;
  currentPath: string;
  /** The document-level navbar reused on pages that do not define their own. */
  sharedNavbar: { links: Link[]; cta?: { label: string; path: string } } | null;
}

const defaultValue: RenderContextValue = {
  siteName: "",
  tagline: "",
  contact: { email: "", phone: "", address: "", hours: "", whatsapp: "" },
  navigation: [],
  pages: [],
  currentPath: "/",
  sharedNavbar: null,
};

const RenderContext = createContext<RenderContextValue>(defaultValue);

export function RenderContextProvider({ value, children }: { value: RenderContextValue; children: ReactNode }) {
  return <RenderContext.Provider value={value}>{children}</RenderContext.Provider>;
}

export function useRenderContext(): RenderContextValue {
  return useContext(RenderContext);
}
