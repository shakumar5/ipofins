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
      filter: (page) =>
        !page.includes('/dashboard')
        && !page.includes('/search')
        && !page.includes('/1-percent-club/holder/'),
    }),
  ],
  output: 'static',
  build: {
    // ~17 KiB global CSS — inline to remove render-blocking link (saves ~170–340 ms LCP/FCP)
    inlineStylesheets: 'always',
    // Parallel page generation after holder data is loaded from export JSON (not per-page Neon queries).
    concurrency: 2,
  },
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
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('SmartMoneyPage')
              || id.includes('SmartMoneyTracker')
              || id.includes('SmartMoneyAppSkeleton')
            ) {
              return 'smart-money-app';
            }
          },
        },
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client'],
    },
  },
});
