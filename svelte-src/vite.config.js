import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "path";

export default defineConfig({
  plugins: [svelte()],
  build: {
    lib: {
      entry: {
        "promptchain-viewer": resolve(__dirname, "main.js"),
        "promptchain-sidebar": resolve(__dirname, "sidebar-main.js"),
        "promptchain-gallery": resolve(__dirname, "gallery-main.js"),
        "promptchain-node": resolve(__dirname, "node-main.svelte.js"),
        "promptchain-fullscreen": resolve(__dirname, "fullscreen-main.svelte.js"),
        "promptchain-tag-builder2": resolve(__dirname, "tag-builder2-main.js"),
        "promptchain-model-settings": resolve(__dirname, "model-settings-main.js"),
        "promptchain-model-indicator": resolve(__dirname, "model-indicator-main.js"),
      },
      formats: ["es"],
    },
    outDir: "../js/lib/svelte",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    cssCodeSplit: false,
    rollupOptions: {
      external: [
        "/scripts/app.js",
        "/scripts/api.js",
        "../../../scripts/app.js",
        "../../../scripts/api.js",
      ],
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
