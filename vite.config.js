import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Disc's renderer is loaded via file:// in production, so base must be relative.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
  },
});
