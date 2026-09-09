import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { port: 5173 },
});
