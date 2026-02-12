import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

// Vite blocks import() of files in public/. ONNX Runtime dynamically imports
// its .mjs glue file, so we serve it from node_modules in dev and copy it on build.
function serveOnnxRuntime() {
  const filename = "ort-wasm-simd-threaded.mjs";
  const srcPath = path.resolve(__dirname, `node_modules/onnxruntime-web/dist/${filename}`);

  return {
    name: "serve-onnx-runtime",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith(`/${filename}`)) {
          res.setHeader("Content-Type", "application/javascript");
          fs.createReadStream(srcPath).pipe(res);
          return;
        }
        next();
      });
    },
    closeBundle() {
      const destPath = path.resolve(__dirname, `dist/${filename}`);
      fs.copyFileSync(srcPath, destPath);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveOnnxRuntime()],
  base: "./",
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Performance: enable minification and tree-shaking
    minify: "esbuild",
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
