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
        <UserMenu />
      </div>
    </header>
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
