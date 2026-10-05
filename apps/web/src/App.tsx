/**
 * Luvify studio routing + auth gate.
 *
 * The authenticated app has exactly two kinds of screen:
 *
 *   `/`                    -> the Projects dashboard (the home screen)
 *   `/projects/:projectId` -> one project's workspace
 *
 * Nothing else is reachable, and nothing redirects *into* a project: the
 * dashboard is what a signed-in user lands on, a workspace only follows an
 * explicit selection (or a deliberately typed project URL), and browser back
 * therefore walks from workspace to dashboard naturally.
 */

import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthScreens } from "./AuthScreens";
import { ProjectsHome } from "./ProjectsHome";
import { Studio } from "./Studio";
import { useAuth, type AuthStatus } from "./auth";

export function App(): JSX.Element {
  const { status } = useAuth();
  const location = useLocation();
  /** The status the app committed to on the previous render. */
  const previousStatus = useRef<AuthStatus>(status);

  // Bookkeeping: the ref always mirrors the last committed status, so the
  // render below can tell a *fresh sign-in* from a session that already exists.
  useEffect(() => {
    previousStatus.current = status;
  }, [status]);

  // Still asking the server who we are: show a splash, never the dashboard.
  if (status === "loading") {
    return (
      <div className="auth-shell auth-loading" role="status" aria-live="polite">
        <span className="brand-mark">L</span>
        <p className="muted">Checking your session...</p>
      </div>
    );
  }

  // No live session -> the project dashboard is unreachable, not merely hidden.
  if (status === "anonymous") return <AuthScreens />;

  /**
   * A fresh sign-in always starts on Projects. An expiry or a sign-out can
   * leave a project URL in the address bar; returning the redirect *during
   * render* (not in an effect afterwards) means no workspace ever mounts -
   * or fetches a single byte - for that stale URL. The guard also requires
   * the path to be somewhere else, so signing in while already at `/` renders
   * the dashboard directly instead of chasing a no-op navigation. Booting an
   * already-signed-in session (`loading` -> `authenticated`) is unaffected,
   * so refreshing an open project URL keeps that project open.
   */
  if (previousStatus.current === "anonymous" && location.pathname !== "/") {
    return <Navigate to="/" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<ProjectsHome />} />
      <Route path="/projects/:projectId" element={<Studio />} />
      {/* Anything else - including `/projects` with no id - is the dashboard. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
