import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
// Removed VitePWA import - we handle Service Worker registration manually

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    server: {
      host: "::",
      port: 8080,
      allowedHosts: ['localhost', '127.0.0.1'], // Hardcoded for debugging
      proxy: {
      "/api/withings": { // New proxy rule for Withings API calls
        target: "http://localhost:3010",
        changeOrigin: true,
        // No rewrite needed, as the backend expects /api/withings
      },
      "/api": {
        target: "http://localhost:3010",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/health-data": {
        target: "http://localhost:3010",
        changeOrigin: true,
        rewrite: (path) => `/api${path}`, // Add /api/ prefix
      },
      "/openid": {
        target: "http://localhost:3010",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openid/, "/openid"), // Keep the /openid prefix
      },
      "/uploads": {
        target: "http://localhost:3010",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // Removed VitePWA plugin - we handle Service Worker and manifest manually
    // This prevents VitePWA from injecting registerSW.js script tags
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "react": path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
  },
  };
});
