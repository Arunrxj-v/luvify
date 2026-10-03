/**
 * Sign in / create account screens - the whole app when there is no session.
 *
 * Kept in the Luvify visual language (same tokens, cards, buttons and type as
 * the studio) so signing in feels like part of the product rather than a
 * bolted-on gate. No token is ever handled here: submitting the form makes the
 * server set an httpOnly cookie, and the app simply becomes authenticated.
 */

import { useEffect, useState, type FormEvent } from "react";
import type { LoginRequest, SignupRequest } from "@luvify/shared";
import { apiUrl } from "./api";
import { useAuth } from "./auth";

type Mode = "login" | "signup";

const PASSWORD_HINT = "At least 8 characters.";

export function AuthScreens(): JSX.Element {
  const { error, pending, signIn, signUp, clearError } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);

  // Presence only - whether Google sign-in is configured, never any secret.
  useEffect(() => {
    let cancelled = false;
    void fetch(apiUrl("/api/auth/providers"), { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { google?: boolean } | null) => {
        if (!cancelled && payload?.google) setGoogleEnabled(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    clearError();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const attempt =
      mode === "login"
        ? signIn({ email, password } satisfies LoginRequest)
        : signUp({ name, email, password } satisfies SignupRequest);
    void attempt.catch(() => {
      // The message is already in the provider state and rendered below.
    });
  };

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <div className="auth-brand">
          <span className="brand-mark">L</span>
          <div>
            <strong>Luvify</strong>
            <span className="brand-sub"> studio</span>
            <p className="muted">
              {mode === "login" ? "Sign in to your projects." : "Create an account to start building."}
            </p>
          </div>
        </div>

        {error ? (
          <div className="banner error auth-error" role="alert">
            <span>{error}</span>
            <button className="banner-close" onClick={clearError} aria-label="Dismiss">
              ×
            </button>
          </div>
        ) : null}

        <form className="form auth-form" onSubmit={submit}>
          {mode === "signup" ? (
            <label>
              Your name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="Alex Rivera"
                maxLength={80}
                required
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "signup" ? PASSWORD_HINT : "Your password"}
              minLength={mode === "signup" ? 8 : 1}
              maxLength={256}
              required
            />
            {mode === "signup" ? <span className="field-hint">{PASSWORD_HINT}</span> : null}
          </label>

          <button className="btn primary auth-submit" type="submit" disabled={pending}>
            {pending ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        {googleEnabled ? (
          <>
            <div className="auth-divider">
              <span>or</span>
            </div>
            <a className="btn google-btn" href={apiUrl("/api/auth/google")}>
              <GoogleMark />
              Continue with Google
            </a>
          </>
        ) : null}

        <p className="auth-switch muted">
          {mode === "login" ? "New to Luvify?" : "Already have an account?"}{" "}
          <button type="button" className="link-button" onClick={() => switchMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}

/** Inline Google "G" - no external asset, so nothing is fetched at sign-in. */
function GoogleMark(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.7 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.8l7.8 6c1.9-5.7 7.2-10.3 13.6-10.3z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.2c-.5-1.4-.8-2.9-.8-4.4s.3-3 .8-4.4l-7.8-6C1 16.5 0 20.1 0 24s1 7.5 2.6 10.6l7.8-6.4z" />
      <path fill="#34A853" d="M24 47.5c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.4 0-11.7-4.6-13.6-10.3l-7.8 6C6.5 42.1 14.6 47.5 24 47.5z" />
    </svg>
  );
}
