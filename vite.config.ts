import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_"],
  define: {
    "import.meta.env.VITE_KAKAO_MAP_JS_KEY": JSON.stringify("196acd86c9ca7b2a46f77dd0d90f11f1"),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
