import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The FastAPI backend (python main.py serve) listens on :8000. Requests to /api/* are proxied there,
// so the backend needs no CORS setup in development or `vite preview`.
const api = {
  "/api": {
    target: process.env.API_TARGET ?? "http://127.0.0.1:8000",
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ""),
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: api },
  preview: { port: 4173, proxy: api },
});
