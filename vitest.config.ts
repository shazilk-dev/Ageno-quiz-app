import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only what the unit and component tests need: the `@/` alias (tsconfig `paths`) and the automatic JSX
// runtime (tsconfig keeps `jsx: preserve` for Next). Component tests opt into jsdom with a
// `// @vitest-environment jsdom` comment on their first line; everything else runs in node.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
