import { cp, copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { defineConfig, type Plugin } from "vite";

const root = import.meta.dirname;
const outDir = resolve(root, "dist");

function copyExtensionFiles(): Plugin {
  return {
    name: "copy-extension-files",
    async closeBundle() {
      await mkdir(resolve(outDir, "store-assets"), { recursive: true });
      await Promise.all([
        copyFile(
          resolve(root, "manifest.json"),
          resolve(outDir, "manifest.json"),
        ),
        copyFile(resolve(root, "LICENSE"), resolve(outDir, "LICENSE")),
        cp(
          resolve(root, "store-assets/icons"),
          resolve(outDir, "store-assets/icons"),
          {
            recursive: true,
          },
        ),
      ]);
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [copyExtensionFiles()],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(root, "src/sidepanel.html"),
        background: resolve(root, "src/background.ts"),
        "content-script": resolve(root, "src/content-script.ts"),
      },
      output: {
        entryFileNames(chunk) {
          if (chunk.name === "background" || chunk.name === "content-script") {
            return "src/[name].js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
