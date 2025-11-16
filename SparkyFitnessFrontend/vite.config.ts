import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

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
    VitePWA({
      registerType: "prompt", // Changed from autoUpdate to prevent automatic registration
      injectRegister: null, // Don't inject any registration code - we handle it manually in index.html
      manifest: {
        name: "SparkyFitness",
        short_name: "SparkyFitness",
        description: "Your personal fitness companion",
        theme_color: "#000000",
        icons: [
          {
            src: "images/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "images/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
      },
    }),
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
