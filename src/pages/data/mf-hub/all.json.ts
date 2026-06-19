import { getMfHubBuildData } from '../../../lib/mf-hub-build';

export async function GET() {
  const hub = await getMfHubBuildData();
  return new Response(JSON.stringify(hub.allFundsForTable), {
    headers: { 'Content-Type': 'application/json' },
  });
}
