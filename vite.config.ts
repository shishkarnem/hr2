import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const APP_VERSION = String(Date.now());

function versionJsonPlugin() {
  return {
    name: "rr-version-json",
    // Dev: serve /version.json from memory.
    configureServer(server: any) {
      server.middlewares.use("/version.json", (_req: any, res: any) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.end(JSON.stringify({ version: APP_VERSION }));
      });
    },
    // Build: emit /version.json into dist.
    generateBundle(this: any) {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: APP_VERSION }),
      });
    },
  };
}

export default defineConfig(() => ({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    react(),
    tailwindcss(),
    versionJsonPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifestFilename: "manifest.webmanifest",
      includeAssets: [
        "favicon.ico",
        "push-sw.js",
        "icons/favicon/icon.svg",
        "icons/favicon/favicon-16x16.png",
        "icons/favicon/favicon-32x32.png",
        "icons/favicon/favicon-48x48.png",
        "icons/favicon/favicon-96x96.png",
        "icons/seo/favicon-120x120.png",
        "icons/seo/favicon-192x192.png",
        "icons/apple/apple-touch-icon.png",
        "icons/apple/apple-touch-icon-152x152.png",
        "icons/apple/apple-touch-icon-167x167.png",
        "icons/apple/apple-touch-icon-120x120.png",
        "icons/pwa/pwa-192x192.png",
        "icons/pwa/pwa-512x512.png",
        "icons/pwa/pwa-maskable-192x192.png",
        "icons/pwa/pwa-maskable-512x512.png",
        "icons/pwa/badge-72x72.png",
      ],
      manifest: {
        name: "Робот Рекрутер — ИИ-платформа найма",
        short_name: "Робот Рекрутер",
        description:
          "ИИ-платформа для автоматического подбора персонала, онлайн-собеседований и корпоративного обучения.",
        lang: "ru",
        dir: "ltr",
        theme_color: "#17344F",
        background_color: "#17344F",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        id: "/",
        categories: ["business", "productivity"],
        icons: [
          {
            src: "/icons/pwa/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/pwa/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/pwa/pwa-maskable-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/pwa/pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Каталог вакансий",
            short_name: "Вакансии",
            url: "/vacancy",
            icons: [{ src: "/icons/pwa/pwa-192x192.png", sizes: "192x192" }],
          },
          {
            name: "Демо ИИ-интервью",
            short_name: "Демо",
            url: "/demo",
            icons: [{ src: "/icons/pwa/pwa-192x192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        importScripts: ["/push-sw.js"],
        globPatterns: ["**/*.{js,css,ico,png,svg,jpg,webp,woff2,webmanifest}"],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/icons/"),
            handler: "CacheFirst",
            options: {
              cacheName: "rr-icons-cache",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules\/(react|react-dom|react-router-dom|scheduler)\//,
              priority: 20,
            },
            {
              name: "radix-vendor",
              test: /node_modules\/@radix-ui\//,
              priority: 15,
            },
            {
              name: "charts-vendor",
              test: /node_modules\/(recharts|d3-[^/]+)\//,
              priority: 15,
            },
            {
              name: "markdown-vendor",
              test: /node_modules\/(react-markdown|remark-[^/]+|unified|mdast-[^/]+|micromark[^/]*|hast-[^/]+)\//,
              priority: 15,
            },
            {
              name: "motion-vendor",
              test: /node_modules\/(motion|framer-motion)\//,
              priority: 15,
            },
            {
              name: "icons-vendor",
              test: /node_modules\/lucide-react\//,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: process.env.APPLET_ID
      ? 3000
      : process.env.PORT
        ? parseInt(process.env.PORT, 10)
        : 3000,
    allowedHosts: true as const,
    hmr: process.env.ENABLE_HMR === "true" && process.env.DISABLE_HMR !== "true",
    watch:
      process.env.ENABLE_HMR === "true" && process.env.DISABLE_HMR !== "true"
        ? {
            ignored: [
              "**/server/**",
              "**/data/**",
              "**/backups/**",
              "**/*.db*",
              "**/*_seed.json",
            ],
          }
        : null,
  },
}));
