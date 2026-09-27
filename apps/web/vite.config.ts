import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** The API server's port (`.env` sets PORT=4000); the dev server proxies to it. */
const apiPort = Number(process.env.PORT ?? 4000) || 4000;
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/sites": { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/sites": { target: apiTarget, changeOrigin: true },
    },
  },
});
