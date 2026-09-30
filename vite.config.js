import { defineConfig } from "vite";

const COMMENT_URL_LINE = /^[ \t]*\/\/[^\n]*https?:\/\/[^\n]*$/gm;

function stripCommentUrls() {
  return {
    name: "strip-comment-urls",
    renderChunk(code) {
      const out = code.replace(COMMENT_URL_LINE, "");
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig({
  root: "web",
  base: "./",
  publicDir: false,
  plugins: [stripCommentUrls()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    modulePreload: { polyfill: false },
    target: "es2022",
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
    proxy: {
      "/events": "http://127.0.0.1:7777",
      "/snapshot": "http://127.0.0.1:7777",
    },
  },
});
