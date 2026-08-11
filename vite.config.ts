import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

function asText(source: string | Uint8Array): string {
  return typeof source === "string" ? source : new TextDecoder().decode(source);
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function standaloneHtml(): Plugin {
  return {
    name: "coedit-standalone-html",
    apply: "build",
    enforce: "post",
    async generateBundle(_options, bundle) {
      const html = bundle["index.html"];
      if (!html || html.type !== "asset") throw new Error("The standalone index.html was not generated.");

      const chunks = Object.values(bundle).filter((output) => output.type === "chunk");
      if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length) {
        throw new Error("The standalone build must contain exactly one self-contained JavaScript chunk.");
      }
      const chunk = chunks[0];
      const styles = Object.values(bundle).filter(
        (output) => output.type === "asset" && output.fileName.endsWith(".css"),
      );
      const unexpected = Object.values(bundle).filter(
        (output) => output !== html && output !== chunk && !styles.includes(output) && !output.fileName.endsWith(".map"),
      );
      if (unexpected.length) {
        throw new Error(`Standalone build contains external assets: ${unexpected.map((output) => output.fileName).join(", ")}`);
      }

      const script = chunk.code
        .replace(/^\/\/# sourceMappingURL=.*$/gm, "")
        .replace(/<\/script/gi, "<\\/script");
      let page = asText(html.source);
      const scriptTag = new RegExp(
        `<script\\b[^>]*\\bsrc=["'][^"']*${escapeForRegExp(chunk.fileName)}["'][^>]*>\\s*</script>`,
      );
      if (!scriptTag.test(page)) throw new Error("Could not locate the generated JavaScript reference in index.html.");
      page = page.replace(scriptTag, () => `<script type="module">${script}</script>`);

      for (const style of styles) {
        if (style.type !== "asset") throw new Error(`${style.fileName} is not a CSS asset.`);
        const css = asText(style.source);
        if (/<\/style/i.test(css)) throw new Error("Generated CSS contains an unsafe </style sequence.");
        const styleTag = new RegExp(
          `<link\\b[^>]*\\bhref=["'][^"']*${escapeForRegExp(style.fileName)}["'][^>]*>`,
        );
        if (!styleTag.test(page)) throw new Error(`Could not locate ${style.fileName} in index.html.`);
        page = page.replace(styleTag, () => `<style>${css}</style>`);
      }

      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(script));
      const policy = [
        "default-src 'none'",
        `script-src 'sha256-${base64(new Uint8Array(digest))}'`,
        "style-src 'unsafe-inline'",
        "img-src data: blob:",
        "font-src data:",
        "connect-src 'none'",
        "object-src 'none'",
        "frame-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join("; ");
      const headEnd = page.lastIndexOf("</head>");
      if (headEnd < 0) throw new Error("The standalone document has no closing head tag.");
      page = `${page.slice(0, headEnd)}    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n  ${page.slice(headEnd)}`;

      const inlineScript = page.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
      if (!inlineScript) throw new Error("The standalone JavaScript was not embedded.");
      try {
        Function(inlineScript);
      } catch (error) {
        throw new Error(`Inlining produced invalid JavaScript: ${error instanceof Error ? error.message : String(error)}`);
      }
      html.source = page;

      for (const output of Object.values(bundle)) {
        if (output !== html) delete bundle[output.fileName];
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const standalone = mode !== "tauri";
  return {
    plugins: [react(), ...(standalone ? [standaloneHtml()] : [])],
    base: standalone ? "./" : undefined,
    clearScreen: false,
    server: {
      host: "127.0.0.1",
      port: 1420,
      strictPort: true,
    },
    envPrefix: ["VITE_", "TAURI_ENV_"],
    build: {
      target: ["es2022", "chrome105", "safari13"],
      minify: "esbuild",
      sourcemap: !standalone,
      assetsInlineLimit: standalone ? Number.MAX_SAFE_INTEGER : undefined,
      cssCodeSplit: !standalone,
      rollupOptions: {
        input: standalone ? "index.html" : "tauri.html",
        output: standalone ? { inlineDynamicImports: true } : undefined,
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    },
  };
});
