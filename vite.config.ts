import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the site from /<repo-name>/, so production builds use
// that base path. Change REPO if the GitHub repo is named differently.
const REPO = "construction-twin-storm";

export default defineConfig(({ command }) => ({
  base: command === "build" ? `/${REPO}/` : "/",
  plugins: [react()],
  server: {
    port: 5180,
    // Fail loudly instead of drifting to 5174: OAuth redirect URIs are exact.
    strictPort: true,
    host: "localhost",
  },
}));
