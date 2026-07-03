import {
  escapeHtml,
  monthSlug,
  stockSignalHref,
  signalDetailHref,
  sectorHref,
  overlapHref,
  holdingsChangesHref,
  articleLink,
  ctaLink,
  articleLinkOrCta,
  stockLink,
  pctChange,
  moveBadge,
  table,
  p,
  h2,
  h3,
  ul,
  ol,
  disclaimer,
  keyTakeaway,
  glossary,
  detailBlock,
} from './html.mjs';
import { topOverlapPairs } from './overlap-pairs.mjs';
import {
  topSectors,
  sectorListPhrase,
  formatTopFunds,
  freshEntriesTakeaway,
  completeExitsTakeaway,
  sectorRotationTakeaway,
  convictionTakeaway,
  amcTakeaway,
  overlapTakeaway,
  GLOSSARY,
} from './narrative.mjs';

const SITE = 'https://ipofins.com';

function articleBase({ title, slug, excerpt, category, tier, month, content, socialPost }) {
  const text = content.replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  const readTime = `${Math.max(4, Math.ceil(words / 200))} min`;
  const date = new Date().toISOString().slice(0, 10);
  return {
    title,
    slug,
    excerpt,
    category,
    readTime,
    date,
    tier,
    month: month || null,
    content,
    socialPost,
    url: `${SITE}/learn/${slug}`,
  };
}

function link(href, text) {
  return articleLinkOrCta(href, text);
}

function fundsForAmc(trackerMonth, amcName) {
  const needle = amcName.toLowerCase();
  const stocks = new Map();
  for (const bucket of ['fresh_entry', 'increased']) {
    for (const row of trackerMonth?.[bucket] || []) {
      const matching = (row.funds || []).filter((f) =>
        String(f.fundName).toLowerCase().includes(needle),
      );
      if (!matching.length) continue;
      const prev = stocks.get(row.stockSlug) || {
        stockName: row.stockName,
        stockSlug: row.stockSlug,
        sector: row.sector,
        funds: [],
        maxChange: 0,
      };
      for (const f of matching) {
        prev.funds.push(f);
        prev.maxChange = Math.max(prev.maxChange, Math.abs(f.pctChange || 0));
      }
      stocks.set(row.stockSlug, prev);
    }
  }
  return [...stocks.values()].sort((a, b) => b.maxChange - a.maxChange);
}

function curatedOnePercentEntities(positions) {
  if (!positions) return [];
  return Object.entries(positions)
    .filter(([k]) => k.startsWith('entity:'))
    .map(([k, rows]) => ({
      slug: k.replace('entity:', ''),
      name: k.replace('entity:', '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      holdings: Array.isArray(rows) ? rows : [],
      totalValue: (Array.isArray(rows) ? rows : []).reduce((s, r) => s + (r.marketValueCr || 0), 0),
    }))
    .filter((e) => e.holdings.length > 0)
    .sort((a, b) => b.totalValue - a.totalValue);
}

function mysteryHolders(positions, limit = 15) {
  if (!positions) return [];
  const skip = /president|government|limited|ltd|pvt|private|company|corporation|trustee|llp|pte|inc|motors|sons|bank|india ltd/i;
  return Object.entries(positions)
    .filter(([k]) => k.startsWith('name:'))
    .map(([k, row]) => ({
      name: k.replace('name:', ''),
      ...(Array.isArray(row) ? row[0] : row),
    }))
    .filter((r) => r.stockName && r.pct >= 1 && !skip.test(r.name))
    .sort((a, b) => (b.marketValueCr || 0) - (a.marketValueCr || 0))
    .slice(0, limit);
}

/** Tier 1 — monthly data-driven articles */
export function generateTier1(data) {
  const articles = [];
  const { latestMonth, prevMonth, trackerMonth, sectorIntel, signalRows, overlapByFund, nameBySlug, holdingsCompare, fundHoldingsAliases } =
    data;
  if (!latestMonth) return articles;

  const mSlug = monthSlug(latestMonth);
  const fresh = [...(trackerMonth?.fresh_entry || [])].sort((a, b) => b.fundCount - a.fundCount);
  const exits = [...(trackerMonth?.complete_exit || [])].sort((a, b) => b.fundCount - a.fundCount);
  const sectors = [...(sectorIntel?.rows || [])].sort((a, b) => Math.abs(b.aumChangePct) - Math.abs(a.aumChangePct));
  const gainers = sectors.filter((s) => s.aumChangePct > 0).slice(0, 10);

  // 1. Fresh entries
  if (fresh.length) {
    const top = fresh.slice(0, 20);
    const sectorBreakdown = topSectors(top);
    const content = [
      keyTakeaway(freshEntriesTakeaway(top, fresh, latestMonth, prevMonth)),
      p(
        `Every month, SEBI-regulated asset managers publish their full equity portfolios. A <strong>fresh entry</strong> is when a stock had zero weight in a fund last month and shows up with a positive weight in ${escapeHtml(latestMonth)} — meaning the fund manager opened a new position rather than adding to an existing one.`,
      ),
      p(
        `This month there were <strong>${fresh.length}</strong> such entries across the tracked universe (vs ${escapeHtml(prevMonth || 'the prior month')}). Stocks with many funds entering together often attract more research attention; a single-fund entry may be a niche thematic bet.`,
      ),
      h2('Sector mix in the top 20'),
      p(`By sector among the 20 most popular fresh entries: ${sectorListPhrase(sectorBreakdown)}.`),
      h2(`Top ${top.length} fresh entries by fund participation`),
      p('Ranked by how many equity schemes added the stock for the first time. Click any stock for fund-level detail.'),
      table(
        ['Stock', 'Sector', 'Funds entering', 'Avg new weight'],
        top.map((r) => [
          stockLink(r.stockSlug, r.stockName),
          escapeHtml(r.sector || '—'),
          String(r.fundCount),
          `${(r.weightAvg || 0).toFixed(2)}%`,
        ]),
      ),
      h2('Spotlight: top 3 names'),
      ...top.slice(0, 3).map((r) => {
        const topFunds = (r.funds || [])
          .sort((a, b) => (b.pctChange || 0) - (a.pctChange || 0))
          .slice(0, 4);
        const fundLines = topFunds.length
          ? `<ul>${topFunds.map((f) => `<li>${escapeHtml(f.fundName)} (${escapeHtml(f.fundCategory || '—')}): new weight ${(f.newPct || 0).toFixed(2)}%</li>`).join('')}</ul>`
          : '<p>See the full tracker for participating funds.</p>';
        return detailBlock(
          `${r.stockName} — ${r.fundCount} funds entered`,
          `<p>${escapeHtml(r.sector || '')} · Average new weight ${(r.weightAvg || 0).toFixed(2)}% across entering schemes.</p>${fundLines}`,
        );
      }),
      h2('How to use this list'),
      ul([
        'Cross-check fresh entries against <a href="/mutual-funds/smart-money/smart-money-signal">Smart Money Signal</a> conviction scores — fresh entry + high score is a stronger combo.',
        `Open the <a href="/mutual-funds/smart-money/fresh-entries-in-${mSlug}">full fresh-entries tracker</a> for all ${fresh.length} stocks and every participating fund.`,
        'Treat 10+ funds entering the same stock as broader consensus; 1–2 funds may reflect a narrow theme or benchmark change.',
        'Fresh entries in banks or large caps often reflect asset-allocation shifts; mid/small-cap entries may signal stock-specific thesis.',
      ]),
      glossary(GLOSSARY.freshEntry),
      disclaimer(latestMonth),
    ].join('\n');

    articles.push(
      articleBase({
        title: `Mutual Fund Fresh Entries in ${latestMonth}: ${fresh.length} New Positions`,
        slug: `mf-fresh-entries-${mSlug}`,
        excerpt: `${fresh.length} stocks entered MF portfolios for the first time in ${latestMonth}. ${top[0]?.stockName} led with ${top[0]?.fundCount} funds adding a new position.`,
        category: 'Smart Money',
        tier: 1,
        month: latestMonth,
        content,
        socialPost: `🆕 ${fresh.length} stocks got their first mutual fund holding in ${latestMonth}. Top name: ${top[0]?.stockName} (${top[0]?.fundCount} funds). Full breakdown → ${SITE}/learn/mf-fresh-entries-${mSlug}`,
      }),
    );
  }

  // 2. Complete exits
  if (exits.length) {
    const top = exits.slice(0, 20);
    const content = [
      keyTakeaway(completeExitsTakeaway(top, exits, latestMonth)),
      p(
        `A <strong>complete exit</strong> is the opposite of a fresh entry: the fund held the stock last month and reduced its weight all the way to <strong>zero</strong> in ${escapeHtml(latestMonth)}. That usually means the manager closed the thesis entirely, not just trimmed profit.`,
      ),
      p(
        `There were <strong>${exits.length}</strong> complete exits this month. When many funds exit the same name, it can signal sector de-rating, valuation concerns, or index/rebalancing effects — always verify on the stock's signal page before reacting.`,
      ),
      h2(`Largest complete exits (${top.length} stocks)`),
      p('Sorted by number of schemes that fully sold out. Prior avg weight shows how large the position was before exit.'),
      table(
        ['Stock', 'Sector', 'Funds exiting', 'Prior avg weight'],
        top.map((r) => [
          stockLink(r.stockSlug, r.stockName),
          escapeHtml(r.sector || '—'),
          String(r.fundCount),
          `${(r.weightAvg || 0).toFixed(2)}%`,
        ]),
      ),
      h2('Spotlight: top 3 exits'),
      ...top.slice(0, 3).map((r) => {
        const exitingFunds = (r.funds || []).slice(0, 4);
        const fundLines = exitingFunds.length
          ? `<ul>${exitingFunds.map((f) => `<li>${escapeHtml(f.fundName)}: was ${(f.prevPct || 0).toFixed(2)}% → 0%</li>`).join('')}</ul>`
          : '';
        return detailBlock(
          `${r.stockName} — ${r.fundCount} funds exited fully`,
          `<p>${escapeHtml(r.sector || '')} · ${r.fundCount} schemes removed the stock entirely.</p>${fundLines}`,
        );
      }),
      h2('How to interpret exits'),
      ul([
        'A complete exit is stronger than a small weight reduction — the manager chose to hold zero.',
        'Compare with fresh entries: a stock appearing on both lists means different funds disagreed.',
        `See all ${exits.length} names on the <a href="/mutual-funds/smart-money/complete-exits-in-${mSlug}">complete exits tracker</a>.`,
      ]),
      glossary(GLOSSARY.completeExit),
      p(
        link(
          `/mutual-funds/smart-money/complete-exits-in-${mSlug}`,
          `View all ${exits.length} complete exits for ${latestMonth} →`,
        ),
      ),
      disclaimer(latestMonth),
    ].join('\n');

    articles.push(
      articleBase({
        title: `Mutual Funds That Fully Exited These Stocks in ${latestMonth}`,
        slug: `mf-complete-exits-${mSlug}`,
        excerpt: `${exits.length} stocks were completely sold out of MF portfolios in ${latestMonth}. ${top[0]?.stockName} saw ${top[0]?.fundCount} schemes exit entirely.`,
        category: 'Smart Money',
        tier: 1,
        month: latestMonth,
        content,
        socialPost: `🚪 ${exits.length} stocks were fully exited by mutual funds in ${latestMonth}. See who left ${top[0]?.stockName} and ${top[1]?.stockName || 'more'} → ${SITE}/learn/mf-complete-exits-${mSlug}`,
      }),
    );
  }

  // 3. Conviction by cap
  if (signalRows.length) {
    const byCap = new Map();
    for (const row of signalRows) {
      const cap = row.category || 'All Cap';
      if (!byCap.has(cap)) byCap.set(cap, []);
      byCap.get(cap).push(row);
    }
    const sections = [];
    for (const [cap, rows] of byCap) {
      const top = rows.sort((a, b) => (b.convictionScore || 0) - (a.convictionScore || 0)).slice(0, 10);
      sections.push(
        h3(`${cap} — highest conviction`),
        table(
          ['Stock', 'Signal', 'Score', 'Net buying funds'],
          top.map((r) => [
            stockLink(r.stockSlug, r.stockName),
            `${r.signalEmoji || ''} ${escapeHtml(r.signal || '')}`,
            String(r.convictionScore ?? '—'),
            String(r.netBuying ?? r.increasedCount ?? '—'),
          ]),
        ),
      );
    }
    const best = [...signalRows].sort((a, b) => (b.convictionScore || 0) - (a.convictionScore || 0))[0];
    const content = [
      keyTakeaway(convictionTakeaway(best, byCap, latestMonth)),
      p(
        `Smart Money Signal scores every stock from 0 to 100 based on six factors: net weight change, net buying funds, fresh entries, complete exits, AMC breadth, and multi-month trend. Scores are <strong>percentile ranks within each market-cap bucket</strong> — a mid-cap stock with score 80 was more active than most mid-caps, not necessarily more active than large-caps.`,
      ),
      p(
        `For ${escapeHtml(latestMonth)}, the highest score in our export is ${best ? stockLink(best.stockSlug, best.stockName) : '—'} (${best?.convictionScore ?? '—'}, ${escapeHtml(best?.signal || '')}). Use the tables below to compare leaders in each cap category.`,
      ),
      ...sections,
      h2('How to read the signal column'),
      ul([
        '🟢 Strong / 🚀 Aggressive Accumulation — funds are net buyers with high relative activity.',
        '🟡 Moderate Accumulation — net buying, but quieter vs cap-bucket peers.',
        '🟠 / 🔴 Distribution — net sellers; score still shows how intense the selling was.',
        'Negative net buying funds means more schemes cut or exited than added.',
      ]),
      p(link('/mutual-funds/smart-money#how-scoring-works', 'Full conviction scoring methodology on Smart Money →')),
      p(link('/mutual-funds/smart-money/smart-money-signal', 'Explore live signal filters by cap and month →')),
      glossary(GLOSSARY.conviction),
      disclaimer(latestMonth),
    ].join('\n');

    articles.push(
      articleBase({
        title: `Top Mutual Fund Conviction Stocks by Market Cap (${latestMonth})`,
        slug: `mf-conviction-by-cap-${mSlug}`,
        excerpt: `Highest MF conviction scores for ${latestMonth} across large, mid, and small cap universes. ${best?.stockName} leads with score ${best?.convictionScore}.`,
        category: 'Smart Money',
        tier: 1,
        month: latestMonth,
        content,
        socialPost: `📊 Where are mutual funds most convicted in ${latestMonth}? ${best?.stockName} tops the list (score ${best?.convictionScore}). Cap-wise breakdown → ${SITE}/learn/mf-conviction-by-cap-${mSlug}`,
      }),
    );
  }

  // 4. Sector rotation
  if (sectors.length) {
    const losers = [...sectors].filter((s) => s.aumChangePct < 0).sort((a, b) => a.aumChangePct - b.aumChangePct).slice(0, 8);
    const content = [
      keyTakeaway(
        sectorRotationTakeaway(
          gainers,
          losers,
          latestMonth,
          sectorIntel?.previousMonth || prevMonth,
          sectorIntel?.fundCount,
        ),
      ),
      p(
        `Sector Intelligence rolls up every equity holding from ${sectorIntel?.fundCount || 'hundreds of'} schemes into industry buckets (Banks, IT, Capital Markets, etc.) and compares <strong>${escapeHtml(sectorIntel?.previousMonth || prevMonth || 'last month')}</strong> vs <strong>${escapeHtml(latestMonth)}</strong>.`,
      ),
      p(
        'AUM change % measures the month-on-month shift in total rupee exposure to that sector. It blends price appreciation with active buying — a sector can rise because stocks went up even if funds did not add new money.',
      ),
      h2('Sectors gaining MF allocation'),
      p('Sorted by largest positive AUM change. Click a sector for stock-level moves inside that industry.'),
      table(
        ['Sector', 'AUM change', 'Signal', 'Funds ↑ / ↓'],
        gainers.map((s) => [
          link(sectorHref(s.sectorSlug), escapeHtml(s.sector)),
          `${s.aumChangePct > 0 ? '+' : ''}${(s.aumChangePct || 0).toFixed(1)}%`,
          `${s.signalEmoji || ''} ${escapeHtml(s.signal || '')}`,
          `${s.fundsIncreasing || 0} / ${s.fundsDecreasing || 0}`,
        ]),
      ),
      losers.length
        ? [
            h2('Sectors losing MF allocation'),
            p('Funds trimmed exposure to these sectors on aggregate. Low current weight % means the industry is a small slice of total MF equity.'),
            table(
              ['Sector', 'AUM change', 'Current weight'],
              losers.map((s) => [
                link(sectorHref(s.sectorSlug), escapeHtml(s.sector)),
                `${(s.aumChangePct || 0).toFixed(1)}%`,
                `${(s.currentPct || 0).toFixed(2)}%`,
              ]),
            ),
          ].join('\n')
        : '',
      h2('Practical use'),
      ul([
        'Use sector rotation for macro allocation context — then drill into individual stocks via Smart Money Tracker.',
        'High AUM change + many funds increasing (↑) suggests broad active buying, not just one large fund.',
        'Pair with fresh entries: if a sector leads rotation and several stocks show fresh entries, the theme is strengthening.',
      ]),
      glossary(GLOSSARY.sector),
      p(link('/mutual-funds/smart-money/sector-intelligence', 'Full sector intelligence dashboard →')),
      disclaimer(latestMonth),
    ].join('\n');

    articles.push(
      articleBase({
        title: `Mutual Fund Sector Rotation: Where Money Moved in ${latestMonth}`,
        slug: `mf-sector-rotation-${mSlug}`,
        excerpt: `${gainers[0]?.sector} saw the biggest MF allocation increase (${gainers[0]?.aumChangePct?.toFixed(1)}%) in ${latestMonth}. See gainers, laggards, and conviction signals.`,
        category: 'Smart Money',
        tier: 1,
        month: latestMonth,
        content,
        socialPost: `🔄 MF sector rotation in ${latestMonth}: ${gainers[0]?.sector} ${gainers[0]?.signalEmoji || ''} leads inflows. Full sector map → ${SITE}/learn/mf-sector-rotation-${mSlug}`,
      }),
    );
  }

  // 5. AMC bought stocks (top 6 AMCs)
  const majorAmcs = [
    { name: 'HDFC', slug: 'hdfc' },
    { name: 'ICICI Prudential', slug: 'icici-prudential' },
    { name: 'SBI', slug: 'sbi' },
    { name: 'Kotak', slug: 'kotak' },
    { name: 'Axis', slug: 'axis' },
    { name: 'Nippon India', slug: 'nippon-india' },
  ].filter((a) => holdingsCompare?.amcs?.some((x) => x.slug === a.slug));

  for (const amc of majorAmcs) {
    const picks = fundsForAmc(trackerMonth, amc.name).slice(0, 15);
    if (!picks.length) continue;
    const content = [
      keyTakeaway(amcTakeaway(amc.name, picks, latestMonth)),
      p(
        `This report aggregates <strong>month-on-month portfolio changes</strong> for every ${escapeHtml(amc.name)} equity scheme with a published ${escapeHtml(latestMonth)} disclosure. We include both fresh entries (new positions) and increases (existing holdings that were scaled up).`,
      ),
      h2('Summary: largest moves'),
      table(
        ['Stock', 'Sector', 'Move', 'Largest Δ', 'Schemes'],
        picks.slice(0, 12).map((r) => {
          const best = [...r.funds].sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange))[0];
          const move = best?.prevPct === 0 ? 'Fresh entry' : 'Increased';
          return [
            stockLink(r.stockSlug, r.stockName),
            escapeHtml(r.sector || '—'),
            moveBadge(move),
            pctChange(best?.pctChange || 0),
            String(r.funds.length),
          ];
        }),
      ),
      h2('Fund-level detail: top 5 stocks'),
      p(`Which ${escapeHtml(amc.name)} schemes drove the biggest moves:`),
      ...picks.slice(0, 5).map((r) => {
        const fundsHtml = formatTopFunds(r.funds, 4).join('<br/>');
        return detailBlock(
          r.stockName,
          `<p>${escapeHtml(r.sector || '')} · ${r.funds.length} ${escapeHtml(amc.name)} scheme(s) active · Max weight change ${r.maxChange.toFixed(2)}%</p><p>${fundsHtml}</p>`,
        );
      }),
      h2('What to do next'),
      ul([
        link(holdingsChangesHref(amc.slug, mSlug), `Open the full ${amc.name} holdings changes tool`),
        'Compare overlap with funds you already own — avoid doubling up on the same stocks via different AMCs.',
        'Cross-check top names on Smart Money Signal for industry-wide conviction, not just this AMC.',
      ]),
      glossary(GLOSSARY.amc),
      disclaimer(latestMonth),
    ].join('\n');

    articles.push(
      articleBase({
        title: `Stocks ${amc.name} Mutual Funds Bought in ${latestMonth}`,
        slug: `${amc.slug}-stocks-bought-${mSlug}`,
        excerpt: `${amc.name} funds added or raised stakes in ${picks[0]?.stockName}, ${picks[1]?.stockName || 'and more'} during ${latestMonth} disclosures.`,
        category: 'Smart Money',
        tier: 1,
        month: latestMonth,
        content,
        socialPost: `🏦 ${amc.name} bought/added ${picks[0]?.stockName} & ${picks[1]?.stockName || 'more'} in ${latestMonth}. AMC holding changes → ${SITE}/learn/${amc.slug}-stocks-bought-${mSlug}`,
      }),
    );
  }

  // 6. Highest overlap pairs
  const pairs = topOverlapPairs(overlapByFund?.bySlug, nameBySlug, 18, fundHoldingsAliases || {});
  if (pairs.length) {
    const hero = pairs[0];
    const heroRow =
      overlapByFund?.bySlug?.[hero.slugA]?.find((r) => r.slug === hero.slugB) ||
      overlapByFund?.bySlug?.[hero.slugB]?.find((r) => r.slug === hero.slugA);
    const commonNames = (heroRow?.common_stock_names || []).slice(0, 15);

    const content = [
      keyTakeaway(overlapTakeaway(hero, overlapByFund?.month || latestMonth)),
      p(
        `Portfolio overlap answers a simple question: <em>if I own Fund A and Fund B, how much of my money is in the same stocks?</em> High overlap means you may pay two expense ratios for nearly identical equity exposure — a common issue when stacking large-cap or flexi-cap funds from different AMCs.`,
      ),
      h2(`Highest overlapping fund pairs (${overlapByFund?.month || latestMonth})`),
      p('Sorted by overlap %. Above ~40% overlap, diversification benefit drops sharply for equity holdings.'),
      table(
        ['Fund A', 'Fund B', 'Overlap %', 'Common stocks'],
        pairs.map((r) => [
          escapeHtml(r.fundA),
          escapeHtml(r.fundB),
          `${(r.overlap || 0).toFixed(1)}%`,
          String(r.common),
        ]),
      ),
      h2('What to do if your funds overlap'),
      ul([
        'Before starting a new SIP, compare it with existing holdings using the overlap checker.',
        'High overlap is not automatically bad — but you should know you are doubling sector bets.',
        'Switching funds may trigger capital gains tax; overlap analysis helps avoid accidental duplication first.',
      ]),
      glossary(GLOSSARY.overlap),
      p(
        `Compare the top pair: ${link(overlapHref(pairs[0].slugA, pairs[0].slugB), `${pairs[0].fundA} vs ${pairs[0].fundB}`)}.`,
      ),
      p(link('/mutual-funds/portfolio-overlap-checker', 'Open portfolio overlap checker →')),
      disclaimer(overlapByFund?.month || latestMonth),
    ].join('\n');

    articles.push(
      articleBase({
        title: `Highest Overlapping Mutual Fund Pairs (${overlapByFund?.month || latestMonth})`,
        slug: `highest-mf-overlap-pairs-${mSlug}`,
        excerpt: `${pairs[0]?.fundA} and ${pairs[0]?.fundB} share ${pairs[0]?.overlap?.toFixed(1)}% portfolio overlap — highest among ${pairs.length} pairs screened.`,
        category: 'Mutual Funds',
        tier: 1,
        month: overlapByFund?.month || latestMonth,
        content,
        socialPost: `⚠️ Paying double fees for the same stocks? ${pairs[0]?.fundA} & ${pairs[0]?.fundB} overlap ${pairs[0]?.overlap?.toFixed(0)}%. Full list → ${SITE}/learn/highest-mf-overlap-pairs-${mSlug}`,
      }),
    );

    // 7. Fund A vs Fund B spotlight (top pair)
    const contentVs = [
      keyTakeaway(overlapTakeaway(hero, overlapByFund?.month || latestMonth)),
      p(
        `${escapeHtml(hero.fundA)} and ${escapeHtml(hero.fundB)} have <strong>${(hero.overlap || 0).toFixed(1)}% portfolio overlap</strong> with ${hero.common} stocks in common — among the highest in our ${escapeHtml(overlapByFund?.month || latestMonth)} snapshot.`,
      ),
      commonNames.length
        ? [
            h2('Sample of shared holdings'),
            p('These stocks appear in both portfolios (partial list):'),
            ul(commonNames.map((n) => escapeHtml(n))),
          ].join('\n')
        : '',
      h2('Should you hold both?'),
      ul([
        'If both are in the same category (e.g. large-cap), you likely duplicate risk — consider consolidating.',
        'If one is thematic and one is broad, overlap may be acceptable if you want the theme tilt.',
        'Check overlap after every new fund purchase or switch — holdings change monthly.',
      ]),
      h2('Why overlap matters'),
      ul([
        'Two high-overlap funds rarely add diversification — they amplify the same sector bets.',
        'Switching between them may trigger unnecessary capital gains without changing risk.',
        'Use overlap before stacking multiple large-cap or flexi-cap funds from the same AMC family.',
      ]),
      glossary(GLOSSARY.overlap),
      p(link(overlapHref(hero.slugA, hero.slugB), `Open side-by-side overlap: ${hero.fundA} vs ${hero.fundB} →`)),
      disclaimer(overlapByFund?.month || latestMonth),
    ].join('\n');

    articles.push(
      articleBase({
        title: `${hero.fundA} vs ${hero.fundB}: Portfolio Overlap Analysis`,
        slug: `mf-overlap-${hero.slugA}-vs-${hero.slugB}`,
        excerpt: `${hero.fundA} and ${hero.fundB} share ${hero.overlap?.toFixed(1)}% holdings overlap (${hero.common} common stocks). Should you hold both?`,
        category: 'Mutual Funds',
        tier: 1,
        month: overlapByFund?.month || latestMonth,
        content: contentVs,
        socialPost: `🤔 ${hero.fundA} vs ${hero.fundB}: ${hero.overlap?.toFixed(0)}% overlap, ${hero.common} same stocks. Worth holding both? → ${SITE}/learn/mf-overlap-${hero.slugA}-vs-${hero.slugB}`,
      }),
    );
  }

  // 8. Monthly umbrella digest
  const digestTakeaway =
    `${escapeHtml(latestMonth)} in one view: ${fresh.length} fresh MF entries, ${exits.length} complete exits`
    + (gainers[0] ? `, sector leader ${escapeHtml(gainers[0].sector)} (+${(gainers[0].aumChangePct || 0).toFixed(0)}% AUM)` : '')
    + (signalRows.length ? `, top conviction ${escapeHtml([...signalRows].sort((a, b) => (b.convictionScore || 0) - (a.convictionScore || 0))[0]?.stockName || '')}` : '')
    + '. Use the linked reports below for tables, fund names, and methodology.';

  articles.push(
    articleBase({
      title: `${latestMonth} Smart Money Monthly: MF Moves You Should Know`,
      slug: `smart-money-monthly-${mSlug}`,
      excerpt: `One-page digest of ${latestMonth} mutual fund activity: fresh entries, exits, sector rotation, conviction leaders, and overlap traps.`,
      category: 'Smart Money',
      tier: 1,
      month: latestMonth,
      content: [
        keyTakeaway(digestTakeaway),
        p(
          `This is your monthly cheat sheet for institutional equity activity in India. All figures come from official AMC portfolio disclosures filed for ${escapeHtml(latestMonth)} and are processed on IPOFins into trackers, signals, and sector views.`,
        ),
        h2('This month at a glance'),
        ul([
          fresh.length
            ? link(`/learn/mf-fresh-entries-${mSlug}`, `${fresh.length} fresh portfolio entries — stocks funds bought for the first time`)
            : 'Fresh entries data pending',
          exits.length
            ? link(`/learn/mf-complete-exits-${mSlug}`, `${exits.length} complete exits — stocks funds sold to zero weight`)
            : 'Complete exits data pending',
          sectors.length
            ? link(`/learn/mf-sector-rotation-${mSlug}`, `Sector rotation: ${gainers[0]?.sector} leads inflows (+${gainers[0]?.aumChangePct?.toFixed(1)}%)`)
            : 'Sector rotation',
          signalRows.length
            ? link(`/learn/mf-conviction-by-cap-${mSlug}`, 'Conviction leaders by market cap (Large / Mid / Small / Micro)')
            : 'Conviction scores',
          pairs.length
            ? link(`/learn/highest-mf-overlap-pairs-${mSlug}`, 'Highest overlapping fund pairs — diversification check')
            : 'Overlap pairs',
        ]),
        h2('Suggested reading order'),
        ol([
          'Start with sector rotation for macro context.',
          'Read fresh entries and exits for stock-level ideas.',
          'Validate names on Smart Money Signal (conviction score + net buying).',
          'Before investing in a new fund, run overlap vs your existing portfolio.',
        ]),
        p(link('/mutual-funds/smart-money', 'Explore the full Smart Money hub →')),
        disclaimer(latestMonth),
      ].join('\n'),
      socialPost: `📰 ${latestMonth} Smart Money digest is live — fresh entries, exits, sectors & conviction stocks in one place → ${SITE}/learn/smart-money-monthly-${mSlug}`,
    }),
  );

  return articles;
}

/** Tier 2 — weekly / reverse-index style */
export function generateTier2(data) {
  const articles = [];
  const { latestMonth, signalRows, sast, topStocks, overlapByFund, nameBySlug, onePercentPositions } = data;
  const mSlug = latestMonth ? monthSlug(latestMonth) : 'latest';

  // 11. Which MFs hold top conviction stock
  const topStock = [...(signalRows || [])].sort((a, b) => (b.convictionScore || 0) - (a.convictionScore || 0))[0];
  if (topStock) {
    const content = [
      keyTakeaway(
        `${escapeHtml(topStock.stockName)} leads all stocks on MF conviction (${topStock.convictionScore}/100) in ${escapeHtml(latestMonth)} with ${topStock.fundsHolding || '—'} funds holding and ${topStock.netBuying ?? topStock.increasedCount ?? 0} net buyers. This page summarises participation — open the stock signal for the full fund list.`,
      ),
      p(
        `When many mutual fund schemes hold the same stock, it reflects broad institutional coverage. The question for research is not just <em>who holds</em> but whether funds are <strong>adding or cutting</strong> this month — that is what conviction score and net buying capture.`,
      ),
      h2('Participation snapshot'),
      ul([
        `Signal: ${topStock.signalEmoji || ''} ${escapeHtml(topStock.signal || '')}`,
        `Conviction score: ${topStock.convictionScore ?? '—'} / 100 (vs peers in ${escapeHtml(topStock.category || 'its cap bucket')})`,
        `Funds holding: ${topStock.fundsHolding ?? '—'}`,
        `Fresh entries this month: ${topStock.freshEntries ?? '—'}`,
        `Complete exits: ${topStock.completeExits ?? '—'}`,
        `Funds increased vs reduced: ${topStock.increasedCount ?? '—'} / ${topStock.decreasedCount ?? '—'}`,
        `AMCs with buy-side activity: ${topStock.amcsBuying ?? '—'} of ${topStock.amcCount ?? '—'}`,
        `Net weight change (aggregate): ${topStock.netWeightChangePct != null ? `${topStock.netWeightChangePct}%` : '—'}`,
      ]),
      h2('How to research this stock'),
      ul([
        link(signalDetailHref(topStock.stockSlug), `Full six-factor score breakdown for ${topStock.stockName}`),
        link(stockSignalHref(topStock.stockSlug), 'Stock signal page — top fund holders by weight'),
        link(`/mutual-funds/smart-money/smart-money-signal`, 'Compare with other high-conviction names'),
        link('/1-percent-club', 'Check super-investor and 1% Club stakes for alignment'),
      ]),
      glossary(GLOSSARY.conviction),
      disclaimer(latestMonth),
    ].join('\n');

    articles.push(
      articleBase({
        title: `Which Mutual Funds Hold ${topStock.stockName}? (${latestMonth})`,
        slug: `which-mfs-hold-${topStock.stockSlug}-${mSlug}`,
        excerpt: `${topStock.stockName} is the top MF conviction pick in ${latestMonth}. ${topStock.fundsHolding}+ funds hold it with ${topStock.netBuying} net buyers.`,
        category: 'Smart Money',
        tier: 2,
        month: latestMonth,
        content,
        socialPost: `🔍 Which mutual funds hold ${topStock.stockName}? ${topStock.fundsHolding}+ schemes, conviction ${topStock.convictionScore}. Details → ${SITE}/learn/which-mfs-hold-${topStock.stockSlug}-${mSlug}`,
      }),
    );
  }

  // 12. Super investors most bought (hub article — page links)
  articles.push(
    articleBase({
      title: 'Super Investors Most Bought Stocks: How to Track Institutional Portfolios',
      slug: 'super-investors-most-bought-guide',
      excerpt: 'Track what Rakesh Jhunjhunwala legacy holdings, Rekha Jhunjhunwala, Madhusudan Kela and other super investors bought each quarter.',
      category: 'Super Investors',
      tier: 2,
      content: [
        keyTakeaway(
          'Super investors (Rakesh Jhunjhunwala legacy, Rekha Jhunjhunwala, Madhusudan Kela, etc.) file quarterly shareholding patterns. New ≥1% entries are the strongest signal; IPOFins tracks these separately from monthly mutual fund data.',
        ),
        p('Super investors file shareholding pattern (SHP) disclosures every quarter. IPOFins maps these to searchable portfolios with quarter-on-quarter changes. Unlike mutual funds (monthly), SHP data has a 45–60 day lag after quarter end.'),
        h2('Where to start'),
        ul([
          link('/super-investors', 'Super Investors directory'),
          link('/super-investors/rakesh-jhunjhunwala', 'Rakesh Jhunjhunwala portfolio (legacy)'),
          link('/1-percent-club', '1% Club — who owns 1%+ of listed stocks'),
        ]),
        h2('How to read quarterly changes'),
        ul([
          'New entries above 1% are the strongest signal — fresh thesis.',
          'Increases within the same quarter often follow add-ons after initial entry.',
          'Complete exits from SHP may still leave sub-1% residual holdings.',
        ]),
        p('<em>Quarterly SHP data updates after exchange filings. Not investment advice.</em>'),
      ].join('\n'),
      socialPost: `🦈 What are India's super investors buying this quarter? Track Jhunjhunwala, Kela & more → ${SITE}/learn/super-investors-most-bought-guide`,
    }),
  );

  // 13. DII & FII net buyers
  if (topStocks?.hasData && topStocks?.buckets) {
    const sections = [];
    for (const [source, label] of [
      ['dii_fii', 'DII & FII'],
      ['mutual_funds', 'Mutual Funds'],
      ['super_investors', 'Super Investors'],
    ]) {
      const bucket = topStocks.buckets[source];
      if (!bucket?.accumulation?.length) continue;
      const top = bucket.accumulation.slice(0, 10);
      sections.push(
        h3(`${label} — top accumulation`),
        table(
          ['Stock', 'Flow signal'],
          top.map((r) => [escapeHtml(r.stockName || r.name), escapeHtml(r.signal || r.flow || 'Accumulation')]),
        ),
      );
    }
    if (sections.length) {
      articles.push(
        articleBase({
          title: `DII & FII Net Buyers: Top Accumulation Stocks`,
          slug: `dii-fii-net-buyers-${mSlug}`,
          excerpt: 'Stocks seeing the strongest institutional accumulation across DII/FII flow data and mutual fund holdings.',
          category: 'Markets',
          tier: 2,
          month: latestMonth,
          content: [...sections, p(link('/top-stocks', 'Explore Top Stocks filters →'))].join('\n'),
          socialPost: `📈 Who are DII & FII net buyers this month? Top accumulation list → ${SITE}/learn/dii-fii-net-buyers-${mSlug}`,
        }),
      );
    }
  }

  // 14. SAST weekly digest
  const sastItems = (sast?.items || []).slice(0, 20);
  if (sastItems.length) {
    const content = [
      keyTakeaway(
        `Latest SAST filings include ${escapeHtml(sastItems[0]?.entityDisplayName || sastItems[0]?.filerName || 'large shareholders')} in ${escapeHtml(sastItems[0]?.stockName || 'listed stocks')}. SAST is event-driven — it often appears before the quarterly shareholding pattern confirms the stake.`,
      ),
      p(
        'Significant Acquisition & Substantial Disposal (SAST) filings are published when a shareholder crosses regulatory thresholds (typically 2%, 5%, or 10% of voting capital). They are useful for spotting large moves early, but always verify the filing PDF on the exchange.',
      ),
      h2('Recent filings'),
      table(
        ['Date', 'Stock', 'Filer', 'Nature'],
        sastItems.map((r) => [
          escapeHtml(r.filingDate || '—'),
          link(`/1-percent-club/${r.stockSlug}`, escapeHtml(r.stockName || r.nseSymbol || '—')),
          escapeHtml(r.entityDisplayName || r.filerName || '—'),
          escapeHtml(r.transactionNature || '—'),
        ]),
      ),
      glossary(GLOSSARY.sast),
      p(link('/super-investors/sast-updates', 'All SAST updates →')),
      p('<em>Compiled from exchange disclosures. Verify filing PDFs before acting.</em>'),
    ].join('\n');

    articles.push(
      articleBase({
        title: 'SAST Filings This Week: Large Shareholder Moves',
        slug: 'sast-weekly-digest',
        excerpt: `Latest ${sastItems.length} SAST disclosures: ${sastItems[0]?.stockName} (${sastItems[0]?.entityDisplayName || sastItems[0]?.filerName}).`,
        category: 'Markets',
        tier: 2,
        content,
        socialPost: `📋 New SAST filings: ${sastItems[0]?.entityDisplayName || sastItems[0]?.filerName} → ${sastItems[0]?.stockName}. Weekly digest → ${SITE}/learn/sast-weekly-digest`,
      }),
    );
  }

  // 15. MF vs Super Investor conflicting signals
  if (topStock) {
    articles.push(
      articleBase({
        title: 'When Mutual Funds and Super Investors Disagree on a Stock',
        slug: `mf-vs-super-investor-signals-${mSlug}`,
        excerpt: `How to reconcile conflicting institutional signals — with ${latestMonth} context on ${topStock.stockName} and where to verify both data sources.`,
        category: 'Smart Money',
        tier: 2,
        month: latestMonth,
        content: [
          keyTakeaway(
            `Mutual funds update monthly; super investors update quarterly. A stock can show MF buying in ${escapeHtml(latestMonth)} while a super investor trimmed in the prior quarter — check timing before calling it a conflict.`,
          ),
          p('Mutual funds report monthly; super investors report quarterly SHP. Timing mismatches can look like disagreement when both are simply on different clocks.'),
          h2('Framework'),
          ul([
            'MF fresh entries + SI new 1% position = strong aligned conviction.',
            'MF complete exits while SI still holds = check if SI stake is legacy or illiquid.',
            'MF accumulation + SI trimming = often profit-taking at different horizons.',
          ]),
          p(`This month MF leaders include ${stockLink(topStock.stockSlug, topStock.stockName)}. Cross-check on ${link('/super-investors', 'Super Investors')} and ${link('/1-percent-club', '1% Club')}.`),
          disclaimer(latestMonth),
        ].join('\n'),
        socialPost: `⚡ MF says buy, super investors say hold? How to read conflicting institutional signals → ${SITE}/learn/mf-vs-super-investor-signals-${mSlug}`,
      }),
    );
  }

  // 1% Club curated entities
  const entities = curatedOnePercentEntities(onePercentPositions).slice(0, 12);
  if (entities.length) {
    const top = entities[0];
    articles.push(
      articleBase({
        title: 'Who Owns 1% of Listed Stocks: 1% Club Snapshot',
        slug: 'one-percent-club-snapshot',
        excerpt: `Tracked promoters, DIIs, and super investors with 1%+ stakes. ${top.name} leads by disclosed market value across ${top.holdings.length} positions.`,
        category: '1% Club',
        tier: 2,
        content: [
          keyTakeaway(
            `The 1% Club lists every shareholder with ≥1% of a listed company. ${escapeHtml(top.name)} tops our tracked snapshot with ${top.holdings.length} disclosed positions.`,
          ),
          p('The 1% Club tracks anyone holding 1% or more of a listed company — promoters, FIIs, mutual funds, DIIs, and high-conviction individuals. Every listed company must disclose these names quarterly in the shareholding pattern.'),
          table(
            ['Holder', 'Positions', 'Est. value (₹ Cr)'],
            entities.map((e) => [
              link(`/1-percent-club/holder/${e.slug}`, escapeHtml(e.name)),
              String(e.holdings.length),
              e.totalValue ? e.totalValue.toFixed(0) : '—',
            ]),
          ),
          glossary(GLOSSARY.onePercent),
          p(link('/1-percent-club', 'Search the full 1% Club →')),
          p('<em>Values from latest available prices. SHP and monthly MF data may lag.</em>'),
        ].join('\n'),
        socialPost: `👤 Who owns 1%+ of Indian stocks? 1% Club snapshot — top holders & positions → ${SITE}/learn/one-percent-club-snapshot`,
      }),
    );
  }

  // Mystery shareholders
  const mysteries = mysteryHolders(onePercentPositions, 12);
  if (mysteries.length) {
    articles.push(
      articleBase({
        title: 'Mystery 1% Shareholders Worth Watching',
        slug: 'mystery-one-percent-shareholders',
        excerpt: `Individual and non-obvious entities holding 1%+ stakes — including ${mysteries[0]?.name} in ${mysteries[0]?.stockName}.`,
        category: '1% Club',
        tier: 2,
        content: [
          keyTakeaway(
            `Beyond promoters and funds, individuals and private entities often hold ≥1% without media coverage. ${escapeHtml(mysteries[0]?.name)} holds ${(mysteries[0]?.pct || 0).toFixed(1)}% of ${escapeHtml(mysteries[0]?.stockName || 'a listed company')}.`,
          ),
          p('Beyond promoters and mutual funds, hundreds of individuals and private entities quietly hold 1%+ stakes. These sometimes precede corporate actions, open offers, or activist campaigns — but many are benign long-term holders.'),
          table(
            ['Holder', 'Stock', 'Stake %', 'Value (₹ Cr)'],
            mysteries.map((r) => [
              escapeHtml(r.name),
              link(`/1-percent-club/${r.stockSlug}`, escapeHtml(r.stockName)),
              `${(r.pct || 0).toFixed(2)}%`,
              r.marketValueCr ? r.marketValueCr.toFixed(0) : '—',
            ]),
          ),
          glossary(GLOSSARY.onePercent),
          p(link('/1-percent-club', 'Discover more on 1% Club →')),
        ].join('\n'),
        socialPost: `🕵️ Mystery 1% shareholders: ${mysteries[0]?.name} holds ${mysteries[0]?.pct?.toFixed(1)}% of ${mysteries[0]?.stockName}. Full list → ${SITE}/learn/mystery-one-percent-shareholders`,
      }),
    );
  }

  return articles;
}

/** Tier 3 — evergreen guides (generated once, refreshed lightly) */
export function generateTier3(data) {
  const articles = [];
  const year = new Date().getFullYear();

  articles.push(
    articleBase({
      title: 'How to Read IPO QIB vs Retail Subscription Data',
      slug: 'how-to-read-ipo-qib-vs-retail-subscription',
      excerpt: 'QIB oversubscription vs retail hype — what institutional demand really signals before IPO listing day.',
      category: 'IPO Basics',
      tier: 3,
      content: [
        keyTakeaway(
          'For long-term IPO quality, QIB (institutional) subscription matters more than retail hype. Retail oversubscription is often inflated by many small applications; QIB demand reflects fund manager diligence.',
        ),
        p('IPO subscription is split into retail, NII (HNI), and QIB (institutional) buckets. Each tells a different story about who wants the stock and why.'),
        h2('QIB subscription'),
        ul([
          'Mutual funds, FIIs, and insurance companies bid in the QIB category.',
          'Strong QIB demand (>10x) often reflects fundamental institutional diligence — not social media hype.',
          'Weak QIB with hot retail can mean listing-day volatility without long-term sponsorship.',
        ]),
        h2('Retail subscription'),
        ul([
          'High retail multiples are common in popular brand IPOs — many small applications inflate the number.',
          'Retail allotment is lottery-based; subscription level does not guarantee allocation.',
        ]),
        h2('Practical checklist'),
        ul([
          'Compare QIB vs NII — both are size-restricted professional categories.',
          'Read the red herring prospectus for use of proceeds and promoter selling.',
          link('/ipo/subscription-status', 'Check live IPO subscription on IPOFins'),
          link('/learn/grey-market-premium-guide', 'Related: subscription categories explained'),
        ]),
        p('<em>IPOFins does not publish grey market premium (GMP). We track official exchange subscription only.</em>'),
      ].join('\n'),
      socialPost: `📊 IPO tip: QIB demand > retail hype for long-term quality. How to read subscription data → ${SITE}/learn/how-to-read-ipo-qib-vs-retail-subscription`,
    }),
  );

  articles.push(
    articleBase({
      title: `How to Evaluate ELSS Fund Holdings Before You Invest (${year})`,
      slug: `how-to-evaluate-elss-holdings-${year}`,
      excerpt: 'A practical checklist for tax-saving ELSS funds — review portfolio disclosure, overlap, and expense ratio before the 3-year lock-in.',
      category: 'Mutual Funds',
      tier: 3,
      content: [
        keyTakeaway(
          'ELSS has a mandatory 3-year lock-in. Before investing for Section 80C, inspect the fund\'s latest stock holdings, overlap with funds you already own, and expense ratio — you cannot exit quickly if the portfolio drifts.',
        ),
        p('ELSS (Equity Linked Savings Scheme) offers Section 80C deduction with a 3-year lock-in. Because you are locked in, holdings transparency and portfolio fit matter more than for open-ended funds.'),
        h2('Step-by-step checklist'),
        ul([
          '<strong>1. Download latest holdings</strong> — every ELSS publishes monthly portfolio disclosure on AMC websites and AMFI.',
          '<strong>2. Check concentration</strong> — if top 10 stocks exceed ~50% weight, the fund is more concentrated than a typical diversified equity fund.',
          '<strong>3. Run overlap</strong> — compare with your existing flexi-cap or large-cap funds; avoid paying twice for the same stocks.',
          '<strong>4. Compare TER</strong> — expense ratio compounds over the lock-in; direct plans are lower cost.',
          '<strong>5. Review 5-year rolling returns</strong> — past performance is not guaranteed, but shows how the strategy behaved across cycles.',
          '<strong>6. Match risk profile</strong> — ELSS is 100% equity; do not use it as a substitute for PPF/FD if you need capital safety.',
        ]),
        h2('Tools on IPOFins'),
        ul([
          link('/mutual-funds', 'Browse mutual fund categories'),
          link('/mutual-funds/portfolio-overlap-checker', 'Check overlap with your existing funds'),
          link('/mutual-funds/smart-money', 'See where fund managers are deploying fresh capital'),
        ]),
        p('<em>Not tax advice. Consult a CA for 80C planning.</em>'),
      ].join('\n'),
      socialPost: `💰 Picking ELSS for tax saving? Use this holdings checklist before the 3-year lock → ${SITE}/learn/how-to-evaluate-elss-holdings-${year}`,
    }),
  );

  return articles;
}

export function generateAllInsightsArticles(data) {
  const articles = [
    ...generateTier1(data),
    ...generateTier2(data),
    ...generateTier3(data),
  ];
  const slugs = new Set();
  return articles.filter((a) => {
    if (slugs.has(a.slug)) return false;
    slugs.add(a.slug);
    return a.content && a.content.trim().length > 0;
  });
}
