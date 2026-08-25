// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

// SSR (node) so raffle pages render server-side for SEO + fresh data.
export default defineConfig({
  site: "https://qori.cc",
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  // Preload linked pages so client-side navigation feels instant.
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  vite: {
    plugins: [tailwindcss()],
  },
});
