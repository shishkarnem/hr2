import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

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
  plugins: [react(), tailwindcss(), versionJsonPlugin()],
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
    hmr: process.env.DISABLE_HMR !== "true",
    watch:
      process.env.DISABLE_HMR === "true"
        ? null
        : {
            ignored: [
              "**/server/**",
              "**/data/**",
              "**/backups/**",
              "**/*.db*",
              "**/*_seed.json",
            ],
          },
  },
}));
