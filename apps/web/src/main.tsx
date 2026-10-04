import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./auth";

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

createRoot(container).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
