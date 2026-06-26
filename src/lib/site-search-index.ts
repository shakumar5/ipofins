/**
 * Site-wide search index for Ctrl+K overlay and /search page.
 * Item shape: { t: title, u: url, y: category, m?: meta, k?: keywords }
 */
import articlesData from '../data/articles.json';
import brokersData from '../data/brokers.json';
import toolsData from '../data/tools.json';
import { getAllIPOs } from './data/ipos';
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

const MF_HUB_PAGES: SiteSearchItem[] = [
  { t: 'Smart Money Tracker', u: '/mutual-funds/smart-money', y: 'Page', m: 'MF institutional activity', k: 'smart money mutual funds' },
  { t: 'Mutual Fund Holdings Changes', u: '/mutual-funds/mutual-fund-holdings-changes', y: 'Page', m: 'AMC portfolio diffs', k: 'holdings changes amc' },
  { t: 'Portfolio Overlap Checker', u: '/mutual-funds/portfolio-overlap-checker', y: 'Page', m: 'Compare fund overlap', k: 'overlap' },
  { t: 'Stock Signal', u: '/mutual-funds/smart-money/stock-signal', y: 'Page', m: 'Per-stock MF conviction', k: 'stock signal' },
  { t: 'Super Investors', u: SUPER_INVESTORS_HUB, y: 'Page', m: 'Curated investor portfolios', k: 'super investors dolly khanna' },
  { t: '1% Club', u: ONE_PERCENT_CLUB_HUB, y: 'Page', m: '≥1% shareholders from SHP', k: 'one percent club shareholding' },
];

export async function buildSiteSearchIndex(): Promise<SiteSearchItem[]> {
  const items: SiteSearchItem[] = [...MF_HUB_PAGES];

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

  const onePercentStocks = await getOnePercentStockSlugs();
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
        k: `${stockName} smart money conviction`,
      });
    }
  }

  try {
    const ipos = await getAllIPOs();
    for (const ipo of ipos) {
      items.push({
        t: ipo.name,
        u: `/ipo/${ipo.slug}`,
        y: 'IPO',
        m: `${ipo.status} · ${ipo.type}`,
        k: `${ipo.name} ${ipo.sector} ipo`,
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
      t: broker.name,
      u: `/broker/${broker.slug}`,
      y: 'Broker',
      m: `${broker.type} broker`,
      k: `${broker.name} brokerage`,
    });
  }

  for (const article of articlesData) {
    if (!article.content?.trim()) continue;
    items.push({
      t: article.title,
      u: `/learn/${article.slug}`,
      y: 'Learn',
      m: article.excerpt?.slice(0, 80),
      k: `${article.title} ${article.category}`,
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
