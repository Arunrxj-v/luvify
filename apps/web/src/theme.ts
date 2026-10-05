/**
 * Application theme: light / dark, persisted per browser in localStorage.
 *
 * The theme belongs to the user's browser, never to a project, so it is stored
 * under its own key (`luvify.theme`) and applied as an attribute on
 * <html> (`data-theme`), which every screen - dashboard, workspace, auth,
 * modals - reads through the shared tokens in styles.css. No component needs
 * to know which theme is active; they all consume the same variables.
 *
 * A tiny module store (not Context) keeps this independent of the auth tree:
 * only the toggle re-renders on change, the rest of the app follows through
 * CSS. An inline script in index.html applies the stored preference before
 * first paint, so a refresh never flashes the wrong background.
 */

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "luvify.theme";

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/** The stored preference; Light is the default for first-time visitors. */
function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    /* private mode / storage blocked - fall through to the default */
  }
  return "light";
}

/**
 * Current theme: the attribute the pre-paint script already applied, falling
 * back to the stored preference when that script did not run.
 */
function readInitialTheme(): Theme {
  const applied = document.documentElement.dataset.theme;
  if (isTheme(applied)) return applied;
  return readStoredTheme();
}

let currentTheme: Theme = readInitialTheme();

const listeners = new Set<() => void>();

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Switches the theme and persists the choice for this browser. */
export function setTheme(theme: Theme): void {
  if (!isTheme(theme) || theme === currentTheme) return;
  currentTheme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage blocked - the theme still applies for this session */
  }
  applyTheme(theme);
  listeners.forEach((listener) => listener());
}

/** One-click flip used by the header toggle. */
export function toggleTheme(): void {
  setTheme(currentTheme === "dark" ? "light" : "dark");
}

/**
 * Applies the initial theme before React renders. Idempotent with the inline
 * pre-paint script, so calling it here only matters when that script is
 * absent (blocked, or a non-browser test environment).
 */
export function initTheme(): void {
  applyTheme(currentTheme);
}

/** Subscribes a component to the current theme. */
export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentTheme,
    (): Theme => "light",
  );
  return [theme, toggleTheme];
}
