import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { initTheme } from "./theme";

// Typefaces of the Luvify design system, bundled (no runtime network calls):
// Lora for the editorial display sizes (project title, interview question),
// Inter for every interface, control and metadata string.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/lora/latin-400.css";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root container");

// Apply the stored light/dark preference before the first render. The inline
// script in index.html has normally already set it before first paint; this
// call is idempotent and covers environments where that script did not run.
initTheme();

createRoot(container).render(
  <React.StrictMode>
    {/* The router owns the URL: `/` is the Projects dashboard and
        `/projects/:id` is a workspace, so a refresh reopens exactly what the
        address bar says - no more, no less. */}
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
