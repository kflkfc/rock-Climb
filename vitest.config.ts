import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@kkc/core": r("packages/core/src"),
      "@kkc/app": r("packages/app/src"),
    },
  },
  test: {
    include: ["packages/*/tests/**/*.test.ts"],
  },
});
