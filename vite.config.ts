import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// Tauri expects a fixed port; fail if that port is not available.
export default defineConfig({
  plugins: [react()],
  // The version shown in the app is the one in package.json, so it always matches the installer.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
