import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: ".",
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      electron: path.resolve(__dirname, "node_modules/electron"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  css: {
    postcss: "./postcss.config.mjs",
  },
  server: {
    port: 5173,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["electron/**/*.test.ts"],
    setupFiles: ["electron/__tests__/helpers/setup.ts"],
    deps: {
      inline: ["electron"],
    },
  },
});
