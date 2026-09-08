import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const automergeBase64Entrypoint = fileURLToPath(
  new URL(
    "./node_modules/@automerge/automerge/dist/mjs/entrypoints/fullfat_base64.js",
    import.meta.url,
  ),
);

export default defineConfig({
  base: "./",
  resolve: {
    alias: [
      // This is Automerge's official `webpack` export. It avoids requiring a
      // Vite-specific WebAssembly plugin in the browser qualification fixture.
      {
        find: /^@automerge\/automerge$/,
        replacement: automergeBase64Entrypoint,
      },
    ],
  },
  build: {
    minify: true,
    sourcemap: true,
  },
});
