import path from "path";
import { defineConfig } from "vitest/config";

// I test unitari stanno sotto src/. Fuori ci sono gli spec Playwright (e2e/) e i
// test Deno delle vecchie funzioni Supabase, che vitest non sa eseguire: senza
// questo `npm test` li raccoglieva e falliva su di loro.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
