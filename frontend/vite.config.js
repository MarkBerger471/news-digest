import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

const isTeen = process.env.VITE_AUDIENCE === "teen";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: isTeen ? "News Digest Jr." : "News Digest",
        short_name: isTeen ? "Digest Jr." : "Digest",
        description: isTeen
          ? "AI-powered news explainers for teenagers"
          : "AI-summarized daily news digest",
        theme_color: isTeen ? "#1a1025" : "#0f172a",
        background_color: isTeen ? "#1a1025" : "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: isTeen ? "icon-teen-192.png" : "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: isTeen ? "icon-teen-512.png" : "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {},
  },
  // Serve the data directory during dev
  publicDir: "public",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
