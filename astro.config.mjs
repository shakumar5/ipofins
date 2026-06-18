import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://ipofins.com',
  integrations: [
    react(),
    sitemap({
      changefreq: 'weekly',
      filter: (page) => !page.includes('/dashboard') && !page.includes('/search'),
    }),
  ],
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client'],
    },
  },
});
