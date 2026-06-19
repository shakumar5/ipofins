import type { FundRecord } from './data/funds';

/** Top 5 by 3Y in each category, plus any fund meeting 2 of 3 multi-criteria checks. */
export function selectBestFunds(funds: FundRecord[]): FundRecord[] {
  const categories = [...new Set(funds.map((f) => f.category))];

  const top5ByCat = new Set<string>();
  for (const cat of categories) {
    funds
      .filter((f) => f.category === cat)
      .sort((a, b) => (b.returns3y ?? -Infinity) - (a.returns3y ?? -Infinity))
      .slice(0, 5)
      .forEach((f) => top5ByCat.add(f.slug));
  }

  const fiveStarFunds = new Set(funds.filter((f) => f.rating === 5).map((f) => f.slug));
  const top10By1Y = new Set(
    [...funds]
      .sort((a, b) => (b.returns1y ?? -Infinity) - (a.returns1y ?? -Infinity))
      .slice(0, 10)
      .map((f) => f.slug),
  );

  const bestSlugs = new Set<string>();
  for (const f of funds) {
    let score = 0;
    if (top5ByCat.has(f.slug)) score++;
    if (fiveStarFunds.has(f.slug)) score++;
    if (top10By1Y.has(f.slug)) score++;
    if (top5ByCat.has(f.slug) || score >= 2) {
      bestSlugs.add(f.slug);
    }
  }

  return funds.filter((f) => bestSlugs.has(f.slug));
}
