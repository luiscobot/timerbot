// @ts-check
import { defineConfig, fontProviders } from "astro/config";

// https://astro.build/config
export default defineConfig({
  server: {
    allowedHosts: ["dev.local"],
  },
  experimental: {
    fonts: [
      {
        provider: fontProviders.google(),
        name: "Inter",
        cssVariable: "--font-inter",
        subsets: ["latin"],
        weights: [400, 500, 700],
      },
    ],
  },
});
