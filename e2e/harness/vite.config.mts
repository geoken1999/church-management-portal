import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../src") } },
  define: { "process.env.NODE_ENV": '"production"' },
  build: {
    lib: { entry: path.resolve(import.meta.dirname, "entry.ts"), formats: ["iife"], name: "KfHarness", fileName: () => "harness.js" },
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
