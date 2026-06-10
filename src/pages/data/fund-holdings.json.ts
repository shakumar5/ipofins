import holdingsData from '../../data/fund-holdings.json';

export async function GET() {
  return new Response(JSON.stringify(holdingsData), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
