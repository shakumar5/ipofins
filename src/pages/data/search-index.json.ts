import iposData from '../../data/ipos.json';
import fundsData from '../../data/mutual-funds.json';
import articlesData from '../../data/articles.json';
import toolsData from '../../data/tools.json';
import brokersData from '../../data/brokers.json';

export async function GET() {
  const searchItems = [
    ...iposData.map((i: any) => ({ t: `${i.name} IPO`, u: `/ipo/${i.slug}`, y: 'IPO', m: `${i.sector} • ${i.type}`, k: `${i.name} ${i.sector} ${i.type} ipo` })),
    ...fundsData.map((f: any) => ({ t: f.name, u: `/mutual-funds/fund/${f.slug}-holdings`, y: 'Fund', m: f.category, k: `${f.name} ${f.category} mutual fund mf` })),
    ...brokersData.map((b: any) => ({ t: `${b.name} Review`, u: `/broker/${b.slug}`, y: 'Broker', m: `${b.type} • ${b.tradingFee}`, k: `${b.name} ${b.type} broker review trading demat` })),
    ...articlesData.filter((a: any) => a.content && a.content.trim().length > 0).map((a: any) => ({ t: a.title, u: `/learn/${a.slug}`, y: 'Learn', m: a.category, k: `${a.title} ${a.category} learn guide` })),
    ...toolsData.map((t: any) => ({ t: t.title, u: `/tools/${t.slug}`, y: 'Tool', m: t.description.slice(0, 40), k: `${t.title} ${t.description} calculator tool` })),
    { t: 'IPO GMP Today', u: '/ipo/gmp-today', y: 'IPO', m: 'Grey Market Premium', k: 'ipo gmp grey market premium today' },
    { t: 'Upcoming IPOs', u: '/ipo/upcoming', y: 'IPO', m: 'DRHP & SEBI Approved', k: 'upcoming ipo drhp sebi new' },
    { t: 'IPO Allotment Status', u: '/ipo/allotment-status', y: 'IPO', m: 'Check registrar', k: 'ipo allotment status check result' },
    { t: 'Best Mutual Funds', u: '/mutual-funds/best', y: 'Fund', m: 'Top rated funds', k: 'best mutual fund top rated' },
    { t: 'All Mutual Funds', u: '/mutual-funds/all', y: 'Fund', m: 'Compare all funds', k: 'all mutual funds compare list' },
    { t: 'Holdings Changes', u: '/mutual-funds/mutual-fund-holdings-changes', y: 'Fund', m: 'Portfolio tracking', k: 'holdings changes portfolio buy sell fund manager' },
    { t: 'Compare Brokers', u: '/broker/compare', y: 'Broker', m: 'Side by side', k: 'compare broker best cheapest' },
    { t: 'SIP Calculator', u: '/tools/sip-calculator', y: 'Tool', m: 'Monthly investment', k: 'sip calculator monthly investment returns' },
    { t: 'Lumpsum Calculator', u: '/tools/lumpsum-calculator', y: 'Tool', m: 'One-time investment', k: 'lumpsum calculator one time investment' },
    { t: 'CAGR Calculator', u: '/tools/cagr-calculator', y: 'Tool', m: 'Compound growth', k: 'cagr calculator compound annual growth rate' },
  ];

  return new Response(JSON.stringify(searchItems), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
