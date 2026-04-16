import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: "localhost",
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: "index.html",
      },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
