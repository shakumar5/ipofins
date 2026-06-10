import iposData from '../../data/ipos.json';
import fundsData from '../../data/mutual-funds.json';
import articlesData from '../../data/articles.json';
import toolsData from '../../data/tools.json';

export async function GET() {
  const searchItems = [
    ...iposData.map((i: any) => ({ t: `${i.name} IPO`, u: `/ipo/${i.slug}`, y: 'IPO', m: `${i.sector} • ${i.type}` })),
    ...fundsData.map((f: any) => ({ t: f.name, u: `/mutual-funds/fund/${f.slug}`, y: 'Fund', m: f.category })),
    ...articlesData.filter((a: any) => a.content && a.content.trim().length > 0).map((a: any) => ({ t: a.title, u: `/learn/${a.slug}`, y: 'Learn', m: a.category })),
    ...toolsData.map((t: any) => ({ t: t.title, u: `/tools/${t.slug}`, y: 'Tool', m: t.description.slice(0, 40) })),
    { t: 'IPO GMP Today', u: '/ipo/gmp-today', y: 'IPO', m: 'Grey Market Premium' },
    { t: 'Upcoming IPOs', u: '/ipo/upcoming', y: 'IPO', m: 'DRHP & SEBI Approved' },
    { t: 'IPO Allotment Status', u: '/ipo/allotment-status', y: 'IPO', m: 'Check registrar' },
    { t: 'Best Mutual Funds', u: '/mutual-funds/best', y: 'Fund', m: 'Top rated funds' },
    { t: 'Compare Brokers', u: '/broker/compare', y: 'Broker', m: 'Side by side' },
  ];

  return new Response(JSON.stringify(searchItems), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
