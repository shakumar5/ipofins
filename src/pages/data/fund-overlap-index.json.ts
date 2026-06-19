import { getFundsWithOverlaps } from '../../lib/data/holdings';

export async function GET() {
  const funds = await getFundsWithOverlaps();
  return new Response(JSON.stringify(funds), {
    headers: { 'Content-Type': 'application/json' },
  });
}
