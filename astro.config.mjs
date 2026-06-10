import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://ipofins.com',

  integrations: [
    react(),
    sitemap({
      changefreq: 'daily',
      lastmod: new Date(),
    }),
  ],

  output: 'static',

  vite: {
    plugins: [tailwindcss()],
<<<<<<< HEAD
=======

    // Removed manualChunks (caused Rollup + React conflict)
    build: {
      cssCodeSplit: true,
      sourcemap: false,
    },
>>>>>>> dd7efd97a52243581285845e69f3525e2b3c1acd
  },
});
