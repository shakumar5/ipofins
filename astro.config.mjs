import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://ipofins.com',

  integrations: [
    react(),
    sitemap(),
  ],

  output: 'static',

  vite: {
    plugins: [tailwindcss()],

    // Removed manualChunks (caused Rollup + React conflict)
    build: {
      cssCodeSplit: true,
      sourcemap: false,
    },
  },
});
