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
      serialize(item) {
        // Assign realistic priority by page type
        const url = item.url;
        const priority =
          url === 'https://ipofins.com/' ? 1.0
          : url.match(/\/ipo\/(?!performance|sector|allotment|subscription|upcoming|mainboard|sme)[^/]+$/) ? 0.9
          : url.match(/\/ipo(\/|$)/) ? 0.9
          : url.match(/\/mutual-funds\/smart-money/) ? 0.9
          : url.match(/\/mutual-funds/) ? 0.85
          : url.match(/\/super-investors\/[^/]+$/) ? 0.85
          : url.match(/\/super-investors/) ? 0.9
          : url.match(/\/tools\//) ? 0.8
          : url.match(/\/1-percent-club/) ? 0.8
          : url.match(/\/learn\//) ? 0.7
          : url.match(/\/broker\//) ? 0.7
          : 0.6;
        return {
          ...item,
          lastmod: new Date().toISOString(),
          priority,
        };
      },
    }),
  ],
  output: 'static',
  build: {
    // ~17 KiB global CSS — inline to remove render-blocking link (saves ~170–340 ms LCP/FCP)
    inlineStylesheets: 'always',
    // Increased from 2 → 8: pages are fully static (all data pre-exported to public/data/).
    // No per-page Neon queries, so more parallelism is safe. Saves ~3-5 min on build.
    concurrency: 8,
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
