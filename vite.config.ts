import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port; fail if that port is not available.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "chrome120",
    minify: "esbuild",
    sourcemap: false,
  },
});
