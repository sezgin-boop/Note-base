import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const BUILD_ID = Date.now().toString(36);

/** Stamp the build id into sw.js so every deploy changes its bytes and browsers pick up the update. */
const stampServiceWorker = (): Plugin => ({
  name: 'stamp-service-worker',
  apply: 'build',
  closeBundle() {
    const file = 'dist/sw.js';
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__BUILD_ID__', BUILD_ID));
  },
});

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  // Also accept the variable names Vercel's Supabase integration creates.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
});
