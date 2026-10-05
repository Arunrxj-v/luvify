/**
 * The signed-in shell shared by every authenticated screen: header, status
 * banner and the async runner both the Projects dashboard and the project
 * workspace drive their actions with.
 *
 * The dashboard and the workspace are separate routes with separate state, so
 * the parts they must share - who is signed in, whether the API is up, how an
 * error surfaces - live here instead of being copied between them.
 */

import { useCallback, useRef, useState, type ReactNode } from "react";
import type { HealthResponseDto } from "@luvify/shared";
import { useAuth } from "./auth";
import { useTheme } from "./theme";

/** First letters of the display name - the fallback when there is no avatar. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export interface Runner {
  /** Label of the action in flight, or null when idle. */
  busy: string | null;
  error: string | null;
  /** True while a failed action can be retried from the banner. */
  canRetry: boolean;
  /**
   * Runs a labelled task: clears the previous error, reports failures through
   * the banner and keeps `busy` set for the duration. Deliberately allows
   * overlapping tasks (boot and the first project open start together).
   */
  run: (label: string, task: () => Promise<void>) => Promise<void>;
  retry: () => void;
  clearError: () => void;
}

/**
 * Runs one labelled async task at a time: busy label for the spinners, an
 * error message with its retry task for the banner. Shared by both screens so
 * a failure always reads the same way wherever it happened.
 */
export function useRunner(): Runner {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef<{ label: string; task: () => Promise<void> } | null>(null);

  const run = useCallback(async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    retryRef.current = null;
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      retryRef.current = { label, task };
    } finally {
      setBusy(null);
    }
  }, []);

  const retry = useCallback(() => {
    const failed = retryRef.current;
    if (failed) void run(failed.label, failed.task);
  }, [run]);

  return {
    busy,
    error,
    canRetry: retryRef.current !== null,
    run,
    retry,
    clearError: useCallback(() => {
      setError(null);
      retryRef.current = null;
    }, []),
  };
}

/**
 * Error/notice strip below the header. Rendered by whichever screen owns the
 * runner that produced the message, so only one is ever on screen.
 */
export function Banner({
  error,
  notice,
  canRetry,
  onRetry,
  onDismiss,
}: {
  error: string | null;
  notice: string | null;
  canRetry: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}): JSX.Element | null {
  if (!error && !notice) return null;

  return (
    <div className={error ? "banner error" : "banner"} role="status">
      <span>{error ?? notice}</span>
      {error && canRetry ? (
        <button className="banner-retry" onClick={onRetry}>
          Retry
        </button>
      ) : null}
      <button className="banner-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

/** Top bar: brand, API/AI status, optional screen-specific right-hand slot. */
export function AppHeader({ health, right }: { health: HealthResponseDto | null; right?: ReactNode }): JSX.Element {
  return (
    <header className="header">
      <button
        className="brand"
        type="button"
        onClick={() => window.scrollTo(0, 0)}
        aria-label="Luvify studio - back to top"
      >
        <span className="brand-mark" aria-hidden="true">
          L
        </span>
        <span className="brand-name">
          Luvify <span className="brand-weak">studio</span>
        </span>
      </button>

      <div className="header-status">
        <span
          className={
            health?.database === "connected" && health.aiKeyConfigured ? "status-dot" : "status-dot warn"
          }
          aria-hidden="true"
        />
        <span className="status-text">
          {health
            ? `API ${health.database} · AI ${health.aiProvider}${
                health.aiProvider === "openrouter" ? (health.aiKeyConfigured ? " ✓" : " · key missing") : ""
              }`
            : "connecting..."}
        </span>
      </div>

      <div className="header-right">
        {right}
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

/**
 * One-click light/dark switch in the top bar. The icon shows the theme you
 * are currently in (sun in light, moon in dark) and the accessible name
 * states the action you get by clicking, per WCAG's label-as-action rule.
 * The choice persists per browser (localStorage, see theme.ts) - it is a
 * property of the visitor, never of a project.
 */
function ThemeToggle(): JSX.Element {
  const [theme, toggle] = useTheme();
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  );
}

/**
 * Signed-in identity in the top bar: avatar, name, email and sign out.
 * Deliberately small - it adds an account area without redesigning the shell.
 */
function UserMenu(): JSX.Element {
  const { user, signOut, pending } = useAuth();
  if (!user) return <></>;

  return (
    <div className="header-user">
      {user.avatarUrl ? (
        <img className="avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="avatar" aria-hidden="true">
          {initialsOf(user.name)}
        </span>
      )}
      <span className="user-meta">
        <strong className="user-name">{user.name}</strong>
        <span className="user-email">{user.email}</span>
      </span>
      <button
        className={"sign-out" + (pending ? " is-loading" : "")}
        onClick={() => void signOut()}
        disabled={pending}
      >
        Sign out
      </button>
    </div>
  );
}
