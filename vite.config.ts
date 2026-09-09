import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Git SHA plus a build stamp, so every deploy (and every local build) is distinguishable. */
function buildId(): string {
  let sha = 'nogit';
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    // Not a git checkout; the stamp alone still changes per build.
  }
  return `${sha}.${Date.now().toString(36)}`;
}

const BUILD_ID = buildId();

/** Emits `version.json` next to the bundle; open tabs poll it to learn a newer build is live. */
const versionFile = (): Plugin => ({
  name: 'version-json',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ build: BUILD_ID, at: new Date().toISOString() }),
    });
  },
});

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      // The app decides when to apply an update (the "New version available" pill),
      // so a half-finished sticker is never yanked out from under the user.
      registerType: 'prompt',
      includeAssets: ['icons/*.svg', 'icons/*.png', 'samples/*.svg'],
      manifest: {
        name: 'Sticker cut line',
        short_name: 'Cut line',
        description: 'Turn a logo into a print-ready sticker: mm-accurate contour, bleed, CutContour export, print PNG.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#171614',
        theme_color: '#171614',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Take control of open pages as soon as the worker activates, so the very first
        // update can hand over cleanly (a page that no worker controls never gets a
        // controllerchange event and would never reload).
        clientsClaim: true,
        // version.json is deliberately not precached: it must always come from the network.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { port: 5173 },
});
