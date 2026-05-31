import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Runs src/tests/setup.ts in each worker before any test, providing the
    // linkedom DOMParser + XMLSerializer polyfills that diffXML.ts requires.
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/tests/**/*.test.ts", "src/tests/**/*.integration.test.ts"],
    exclude: ["src/scripts/**", "node_modules", "dist"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
