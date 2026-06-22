import { getAllIPOs } from '../../lib/data/ipos';
import { fundHoldingsHref, getAllFunds, getFundHoldingsLinkMeta, resolveFundDetailSlug } from '../../lib/data/funds';
import articlesData from '../../data/articles.json';
import toolsData from '../../data/tools.json';
import brokersData from '../../data/brokers.json';

export async function GET() {
  const [iposData, fundsData, holdingsMeta] = await Promise.all([
    getAllIPOs(),
    getAllFunds(),
    getFundHoldingsLinkMeta(),
  ]);

  const searchItems = [
    ...iposData.map((i) => ({
      t: `${i.name} IPO`,
      u: `/ipo/${i.slug}`,
      y: 'IPO',
      m: `${i.sector} • ${i.type}`,
      k: `${i.name} ${i.sector} ${i.type} ipo`,
    })),
    ...fundsData.map((f) => {
      const detailSlug = resolveFundDetailSlug(f, holdingsMeta);
      return {
        t: f.name,
        u: fundHoldingsHref(detailSlug),
        y: 'Fund',
        m: f.category,
        k: `${f.name} ${f.category} mutual fund mf`,
      };
    }),
    ...brokersData.map((b: { name: string; slug: string; type: string; tradingFee: string }) => ({
      t: `${b.name} Review`,
      u: `/broker/${b.slug}`,
      y: 'Broker',
      m: `${b.type} • ${b.tradingFee}`,
      k: `${b.name} ${b.type} broker review trading demat`,
    })),
    ...articlesData
      .filter((a: { content?: string }) => a.content && a.content.trim().length > 0)
      .map((a: { title: string; slug: string; category: string }) => ({
        t: a.title,
        u: `/learn/${a.slug}`,
        y: 'Learn',
        m: a.category,
        k: `${a.title} ${a.category} learn guide`,
      })),
    ...toolsData.map((t: { title: string; slug: string; description: string }) => ({
      t: t.title,
      u: `/tools/${t.slug}`,
      y: 'Tool',
      m: t.description.slice(0, 40),
      k: `${t.title} ${t.description} calculator tool`,
    })),
    { t: 'IPO Subscription Status', u: '/ipo/subscription-status', y: 'IPO', m: 'Live oversubscription', k: 'ipo subscription status oversubscribed today' },
    { t: 'Upcoming IPOs', u: '/ipo/upcoming', y: 'IPO', m: 'DRHP & SEBI Approved', k: 'upcoming ipo drhp sebi new' },
    { t: 'IPO Allotment Status', u: '/ipo/allotment-status', y: 'IPO', m: 'Check registrar', k: 'ipo allotment status check result' },
    { t: 'Best Mutual Funds', u: '/mutual-funds/best', y: 'Fund', m: 'Top rated funds', k: 'best mutual fund top rated' },
    { t: 'All Mutual Funds', u: '/mutual-funds/all', y: 'Fund', m: 'Compare all funds', k: 'all mutual funds compare list' },
    { t: 'Holdings Changes', u: '/mutual-funds/mutual-fund-holdings-changes', y: 'Fund', m: 'Portfolio tracking', k: 'holdings changes portfolio buy sell fund manager' },
    { t: 'Portfolio Overlap Checker', u: '/mutual-funds/portfolio-overlap-checker', y: 'Fund', m: 'Compare fund overlap', k: 'portfolio overlap checker common holdings duplicate exposure' },
    { t: 'Fund Overlap', u: '/mutual-funds/fund-overlap', y: 'Fund', m: 'Pairwise fund overlap', k: 'fund overlap pairwise portfolio concentration duplicate stocks' },
    { t: 'Compare Brokers', u: '/broker/compare', y: 'Broker', m: 'Side by side', k: 'compare broker best cheapest' },
    { t: 'SIP Calculator', u: '/tools/sip-calculator', y: 'Tool', m: 'Monthly investment', k: 'sip calculator monthly investment returns' },
    { t: 'Lumpsum Calculator', u: '/tools/lumpsum-calculator', y: 'Tool', m: 'One-time investment', k: 'lumpsum calculator one time investment' },
    { t: 'SWP Calculator', u: '/tools/swp-calculator', y: 'Tool', m: 'Systematic withdrawal', k: 'swp calculator systematic withdrawal plan retirement income' },
    { t: 'CAGR Calculator', u: '/tools/cagr-calculator', y: 'Tool', m: 'Compound growth', k: 'cagr calculator compound annual growth rate' },
  ];

  return new Response(JSON.stringify(searchItems), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
