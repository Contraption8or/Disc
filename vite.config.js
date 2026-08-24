import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Disc's renderer is loaded via file:// in production, so base must be relative.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // electron-builder writes packaged builds here (release/win-unpacked/*),
    // including locked .exe files mid-build — Vite's watcher has no reason
    // to see this gitignored output dir and crashes with EBUSY if it tries
    // to watch a file electron-builder is writing at that exact moment.
    watch: {
      ignored: ["**/release/**"],
    },
  },
  build: {
    outDir: "dist",
  },
});
