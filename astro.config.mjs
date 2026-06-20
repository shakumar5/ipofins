import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const PORTFOLIO_OVERLAP_BASE = '/mutual-funds/portfolio-overlap-checker';

function isPortfolioOverlapComparison(url) {
  return (
    url.startsWith(`${PORTFOLIO_OVERLAP_BASE}/`) &&
    url !== `${PORTFOLIO_OVERLAP_BASE}/` &&
    url.includes('-vs-')
  );
}

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
    plugins: [
      tailwindcss(),
      {
        name: 'mf-deep-link-fallback',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            const url = req.url?.split('?')[0] ?? '';
            if (isPortfolioOverlapComparison(url)) {
              req.url = PORTFOLIO_OVERLAP_BASE;
            }
            next();
          });
        },
      },
    ],
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client'],
    },
  },
});
