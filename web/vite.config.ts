import { defineConfig } from "vite";

// Relative base + relative asset paths so the built site works when hosted
// under a subpath (e.g. apps.charliekrug.com/signal-jam), not just at a
// domain root.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2022",
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
});
