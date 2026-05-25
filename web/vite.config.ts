import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const tlsDir = path.resolve(__dirname, "../.tls");
const tlsCert = path.join(tlsDir, "cert.pem");
const tlsKey = path.join(tlsDir, "cert-key.pem");
const hasTls = fs.existsSync(tlsCert) && fs.existsSync(tlsKey);

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // Cache все assets (JS/CSS/woff2/PNG)
        globPatterns: ["**/*.{js,css,woff2,ico,png,svg}"],
        // API и Telegram JS — не кэшировать, данные должны быть свежими
        navigateFallback: null,
        runtimeCaching: [
          {
            // OSM тайлы: CacheFirst, 7 дней, до 1000 тайлов (~15 МБ)
            urlPattern: ({ url }: { url: URL }) => url.hostname.endsWith(".tile.openstreetmap.org"),
            handler: "CacheFirst" as const,
            options: {
              cacheName: "osm-tiles-v1",
              expiration: { maxEntries: 3000, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "Попутчики",
        short_name: "Попутчики",
        description: "Поиск попутчиков в ЖК Царёво",
        theme_color: "#2d5a3d",
        background_color: "#f4f5f4",
        display: "standalone",
        lang: "ru",
        icons: [],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    ...(hasTls && {
      https: {
        cert: fs.readFileSync(tlsCert),
        key: fs.readFileSync(tlsKey),
      },
    }),
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2020",
    minify: "terser",
    terserOptions: {
      compress: { passes: 2, drop_console: false, pure_getters: true },
      format: { comments: false },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          )
            return "vendor-react";
          if (id.includes("node_modules/react-router") || id.includes("node_modules/@remix-run"))
            return "vendor-router";
          if (
            id.includes("node_modules/@tanstack/react-query-persist") ||
            id.includes("node_modules/@tanstack/query-sync") ||
            id.includes("node_modules/@tanstack/query-core") ||
            id.includes("node_modules/@tanstack/react-query")
          )
            return "vendor-query";
          if (id.includes("node_modules/leaflet")) return "vendor-leaflet";
        },
      },
    },
  },
});
