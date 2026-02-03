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
      allowedHosts: true, // Allow all hosts in development to prevent HMR connection failures
      proxy: {
        "/health-data": {
          target: "http://localhost:3010",
          changeOrigin: true,
          rewrite: (path) => `/api${path}`, // Add /api/ prefix
        },
        "/api": {
          target: "http://localhost:3010",
          changeOrigin: true,
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
      // Temporarily disabled for development to debug refresh issue
      // mode === "production" && VitePWA({...})
      mode === "production" && VitePWA({
        registerType: "prompt",
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
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/, /^\/uploads/], // Don't serve index.html for API or Uploads
        },
      }),
    ].filter(Boolean),
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Large independent packages in their own chunks
              if (id.includes('recharts')) return 'vendor-recharts';
              if (id.includes('leaflet')) return 'vendor-leaflet';
              if (id.includes('@radix-ui')) return 'vendor-radix';
              if (id.includes('@ericblade/quagga2') || id.includes('html5-qrcode') || id.includes('@zxing/library')) return 'vendor-scanners';
              if (id.includes('@dnd-kit')) return 'vendor-dnd';
              // Everything else (React, utilities, auth, axios) together to avoid dependency issues
              // This ensures React loads before anything that depends on it
              return 'vendor-others';
            }
          }
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
