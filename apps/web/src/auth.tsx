/**
 * Authentication state for the studio.
 *
 * One provider owns the whole lifecycle: check the session on boot, expose
 * loading / anonymous / authenticated, and hand the sign-in screens back to the
 * user the moment a protected request reports 401.
 *
 * The credential itself never lives here - it is an httpOnly cookie the browser
 * attaches on its own. This store only ever holds the *public* user profile.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LoginRequest, MeResponseDto, SignupRequest, UserDto } from "@luvify/shared";
import { ApiClientError, api, onUnauthorized } from "./api";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

/** Friendly text for the `?auth_error=` codes the OAuth callback redirects with. */
const OAUTH_ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured on this server.",
  invalid_state: "That sign-in link expired. Please try again.",
  cancelled: "Google sign-in was cancelled.",
  access_denied: "Google sign-in was cancelled.",
  oauth_failed: "Google sign-in failed. Please try again.",
  oauth_exchange_failed: "Google rejected the sign-in. Please try again.",
  oauth_identity_failed: "Google did not return a usable account.",
  oauth_unverified_email: "That Google account's email address is not verified.",
  account_exists_password:
    "This email address already has a password account. Sign in with your email and password instead.",
  account_conflict: "This email address is linked to a different Google account.",
};

interface AuthContextValue {
  status: AuthStatus;
  user: UserDto | null;
  provider: MeResponseDto["provider"] | null;
  /** Error from the last sign-in/sign-up attempt, or an OAuth redirect. */
  error: string | null;
  /** True while a sign-in/sign-up request is in flight. */
  pending: boolean;
  signIn: (input: LoginRequest) => Promise<void>;
  signUp: (input: SignupRequest) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Reads `?auth_error=` left behind by the OAuth callback, then cleans it up. */
function consumeOAuthError(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("auth_error");
  if (!code) return null;
  url.searchParams.delete("auth_error");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  return OAUTH_ERRORS[code] ?? "Google sign-in failed. Please try again.";
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserDto | null>(null);
  const [provider, setProvider] = useState<MeResponseDto["provider"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** Blocks duplicate boot calls (React StrictMode mounts effects twice). */
  const bootingRef = useRef(false);

  const applySession = useCallback((session: MeResponseDto) => {
    setUser(session.user);
    setProvider(session.provider);
    setStatus("authenticated");
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setProvider(null);
    setStatus("anonymous");
  }, []);

  /** Resolves the current session. Never throws: a failed check is not an error. */
  const refresh = useCallback(async () => {
    try {
      applySession(await api<MeResponseDto>("/api/auth/me"));
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        clearSession();
        return;
      }
      // Network/server hiccup during boot: treat as signed out rather than
      // trapping the user on a spinner, but keep the reason visible.
      clearSession();
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [applySession, clearSession]);

  useEffect(() => {
    const initial = consumeOAuthError();
    if (initial) setError(initial);
    if (bootingRef.current) return;
    bootingRef.current = true;
    void refresh();
  }, [refresh]);

  // A 401 on any protected call means the session is gone (expiry, logout in
  // another tab, server-side revocation). Drop to the sign-in screen.
  useEffect(
    () =>
      onUnauthorized(() => {
        clearSession();
        setError("Your session has expired. Please sign in again.");
      }),
    [clearSession],
  );

  const runAuth = useCallback(
    async (task: () => Promise<void>) => {
      setPending(true);
      setError(null);
      try {
        await task();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        throw caught;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const signIn = useCallback(
    (input: LoginRequest) =>
      runAuth(async () => {
        await api("/api/auth/login", { method: "POST", body: JSON.stringify(input) });
        await refresh();
      }),
    [refresh, runAuth],
  );

  const signUp = useCallback(
    (input: SignupRequest) =>
      runAuth(async () => {
        await api("/api/auth/signup", { method: "POST", body: JSON.stringify(input) });
        await refresh();
      }),
    [refresh, runAuth],
  );

  const signOut = useCallback(async () => {
    setPending(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the call failed, drop the local session: the cookie may already
      // be gone, and staying "signed in" in the UI would be a lie.
    } finally {
      setPending(false);
      clearSession();
      setError(null);
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, provider, error, pending, signIn, signUp, signOut, clearError: () => setError(null) }),
    [status, user, provider, error, pending, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
