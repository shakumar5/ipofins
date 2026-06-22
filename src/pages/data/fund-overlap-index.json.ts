import { readFundOverlapIndexFromDisk } from '../../lib/holdings-compare-server';

export async function GET() {
  const funds = readFundOverlapIndexFromDisk() ?? [];
  return new Response(JSON.stringify(funds), {
    headers: { 'Content-Type': 'application/json' },
  });
}
