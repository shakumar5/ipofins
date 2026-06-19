import { getMfHubBuildData } from '../../../lib/mf-hub-build';

export async function GET() {
  const hub = await getMfHubBuildData();
  return new Response(
    JSON.stringify({
      categories: hub.categories,
      bestFundsCount: hub.bestFundsCount,
      totalFunds: hub.totalFunds,
      holdingsCount: hub.holdingsCount,
      dataDate: hub.dataDate,
      amcCount: hub.amcCount,
      fundCount: hub.fundCount,
      latestMonth: hub.latestMonth,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
