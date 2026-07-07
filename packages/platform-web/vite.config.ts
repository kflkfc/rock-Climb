import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: "./",
  server: { host: true, open: true },
  build: { target: "es2020", outDir: "dist" },
  resolve: {
    alias: {
      "@kkc/core": r("../core/src"),
      "@kkc/app": r("../app/src"),
    },
  },
});
