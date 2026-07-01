/**
 * Site-wide search index for Ctrl+K overlay and /search page.
 * Item shape: { t: title, u: url, y: category, m?: meta, k?: keywords }
 */
import articlesData from '../data/articles.json';
import brokersData from '../data/brokers.json';
import toolsData from '../data/tools.json';
import { getAllIPOs } from './data/ipos';
import {
  getAllFunds,
  getFundHoldingsLinkMeta,
  fundHoldingsHref,
  resolveFundDetailSlug,
} from './data/funds';
import {
  getSuperInvestors,
  getOnePercentStockSlugs,
  superInvestorUrl,
  onePercentStockUrl,
  SUPER_INVESTORS_HUB,
  ONE_PERCENT_CLUB_HUB,
} from './tracked-entities';
import { stockSignalPath } from './stock-signal-meta';
import { loadSmartMoneyStockSlugs } from './smart-money-stock-slugs';

export interface SiteSearchItem {
  t: string;
  u: string;
  y: string;
  m?: string;
  k?: string;
}

const HUB_PAGES: SiteSearchItem[] = [
  { t: 'Mutual Funds', u: '/mutual-funds', y: 'Page', m: 'MF hub', k: 'mutual funds mf amc' },
  { t: 'Smart Money Tracker', u: '/mutual-funds/smart-money', y: 'Page', m: 'MF institutional activity', k: 'smart money tracker conviction institutional mutual funds amc buying selling' },
  { t: 'Sector Intelligence', u: '/mutual-funds/smart-money/sector-intelligence', y: 'Page', m: 'MF sector rotation', k: 'smart money sector intelligence mutual funds' },
  { t: 'Stock Signal', u: '/mutual-funds/smart-money/stock-signal', y: 'Page', m: 'Per-stock MF conviction', k: 'stock signal smart money conviction mutual funds' },
  { t: 'Best Mutual Funds', u: '/mutual-funds/best', y: 'Fund', m: 'Top rated funds', k: 'best mutual fund top rated hdfc icici sbi' },
  { t: 'All Mutual Funds', u: '/mutual-funds/all', y: 'Fund', m: 'Compare all funds', k: 'all mutual funds compare list hdfc icici' },
  { t: 'Mutual Fund Holdings Changes', u: '/mutual-funds/mutual-fund-holdings-changes', y: 'Fund', m: 'AMC portfolio diffs', k: 'holdings changes portfolio buy sell fund manager amc' },
  { t: 'Portfolio Overlap Checker', u: '/mutual-funds/portfolio-overlap-checker', y: 'Fund', m: 'Compare fund overlap', k: 'portfolio overlap checker common holdings duplicate exposure' },
  { t: 'Fund Overlap', u: '/mutual-funds/fund-overlap', y: 'Fund', m: 'Pairwise fund overlap', k: 'fund overlap pairwise portfolio concentration' },
  { t: 'Top Stocks', u: '/top-stocks', y: 'Page', m: 'Net rupee stock flows by cap', k: 'top stocks accumulation distribution mutual funds super investors dii fii lic institutions 1 percent club large mid small micro' },
  { t: 'Super Investors', u: SUPER_INVESTORS_HUB, y: 'Page', m: 'Curated investor portfolios', k: 'super investors dolly khanna portfolio shareholding' },
  { t: '1% Club', u: ONE_PERCENT_CLUB_HUB, y: 'Page', m: '≥1% shareholders from SHP', k: 'one percent club shareholding pattern' },
  { t: 'IPO Subscription Status', u: '/ipo/subscription-status', y: 'IPO', m: 'Live oversubscription', k: 'ipo subscription status oversubscribed today' },
  { t: 'Upcoming IPOs', u: '/ipo/upcoming', y: 'IPO', m: 'DRHP & SEBI Approved', k: 'upcoming ipo drhp sebi new' },
  { t: 'IPO Allotment Status', u: '/ipo/allotment-status', y: 'IPO', m: 'Check registrar', k: 'ipo allotment status check result' },
  { t: 'Compare Brokers', u: '/broker/compare', y: 'Broker', m: 'Side by side', k: 'compare broker best cheapest zerodha groww' },
];

export async function buildSiteSearchIndex(): Promise<SiteSearchItem[]> {
  const items: SiteSearchItem[] = [...HUB_PAGES];

  for (const e of getSuperInvestors()) {
    const aliases = [e.name, e.displayName, ...(e.aliases ?? [])].join(' ');
    items.push({
      t: e.displayName,
      u: superInvestorUrl(e.slug),
      y: 'Investor',
      m: `Super investor · ${e.focus ?? e.type}`,
      k: `${aliases} portfolio shareholding ${e.slug}`,
    });
  }

  const [onePercentStocks, fundsData, holdingsMeta] = await Promise.all([
    getOnePercentStockSlugs().catch(() => [] as Awaited<ReturnType<typeof getOnePercentStockSlugs>>),
    getAllFunds().catch(() => []),
    getFundHoldingsLinkMeta().catch(() => ({ slugs: new Set<string>(), stockCounts: {} as Record<string, number> })),
  ]);

  const mfSlugs = new Set(loadSmartMoneyStockSlugs().map((s) => s.slug));

  for (const { slug, stockName } of onePercentStocks) {
    items.push({
      t: stockName,
      u: onePercentStockUrl(slug),
      y: 'Stock',
      m: '≥1% shareholders · 1% Club',
      k: `${stockName} shareholding pattern holders ${slug}`,
    });
    if (mfSlugs.has(slug)) {
      items.push({
        t: `${stockName} Stock Signal`,
        u: stockSignalPath(slug),
        y: 'Stock',
        m: 'Mutual fund institutional activity',
        k: `${stockName} smart money conviction stock signal`,
      });
    }
  }

  for (const f of fundsData) {
    const detailSlug = resolveFundDetailSlug(f, holdingsMeta);
    items.push({
      t: f.name,
      u: fundHoldingsHref(detailSlug),
      y: 'Fund',
      m: f.category,
      k: `${f.name} ${f.category} mutual fund mf`,
    });
  }

  try {
    const ipos = await getAllIPOs();
    for (const ipo of ipos) {
      items.push({
        t: `${ipo.name} IPO`,
        u: `/ipo/${ipo.slug}`,
        y: 'IPO',
        m: `${ipo.status} · ${ipo.type}`,
        k: `${ipo.name} ${ipo.sector} ${ipo.type} ipo`,
      });
    }
  } catch {
    /* DB optional at build */
  }

  for (const tool of toolsData) {
    items.push({
      t: tool.title,
      u: `/tools/${tool.slug}`,
      y: 'Tool',
      m: tool.description?.slice(0, 80),
      k: `${tool.title} calculator ${tool.category}`,
    });
  }

  for (const broker of brokersData) {
    items.push({
      t: `${broker.name} Review`,
      u: `/broker/${broker.slug}`,
      y: 'Broker',
      m: `${broker.type} broker`,
      k: `${broker.name} ${broker.type} broker review trading demat`,
    });
  }

  for (const article of articlesData) {
    if (!article.content?.trim()) continue;
    items.push({
      t: article.title,
      u: `/learn/${article.slug}`,
      y: 'Learn',
      m: article.excerpt?.slice(0, 80),
      k: `${article.title} ${article.category} learn guide`,
    });
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.u;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
