import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const webPublic = fileURLToPath(new URL("../web/public", import.meta.url));

export default defineConfig({
  plugins: [react()],
  publicDir: webPublic,
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.io"],
    proxy: {
      "/api": { target: "http://127.0.0.1:4000", changeOrigin: true },
    },
  },
});
