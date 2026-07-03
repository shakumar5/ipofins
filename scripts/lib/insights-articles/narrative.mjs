import { escapeHtml } from './html.mjs';

/** Count rows by sector field; return top N as [sector, count]. */
export function topSectors(rows, field = 'sector', limit = 5) {
  const counts = new Map();
  for (const row of rows || []) {
    const s = row[field] || 'Unknown';
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function sectorListPhrase(pairs) {
  if (!pairs.length) return '';
  return pairs.map(([s, n]) => `${escapeHtml(s)} (${n})`).join(', ');
}

export function formatTopFunds(funds, limit = 3) {
  const sorted = [...(funds || [])].sort((a, b) => Math.abs(b.pctChange || 0) - Math.abs(a.pctChange || 0));
  return sorted.slice(0, limit).map((f) => {
    const move = f.prevPct === 0 ? 'new position' : `${f.prevPct?.toFixed(2)}% → ${f.newPct?.toFixed(2)}%`;
    return `<strong>${escapeHtml(f.fundName)}</strong> (${escapeHtml(f.fundCategory || '—')}, ${move})`;
  });
}

export function freshEntriesTakeaway(top, fresh, latestMonth, prevMonth) {
  const leader = top[0];
  const sectors = topSectors(top.slice(0, 20));
  const broad = top.filter((r) => r.fundCount >= 10).length;
  return `In ${escapeHtml(latestMonth)}, mutual funds opened <strong>${fresh.length} brand-new stock positions</strong> versus ${escapeHtml(prevMonth || 'the prior month')}. `
    + `${escapeHtml(leader?.stockName || 'The top name')} drew the widest participation (${leader?.fundCount || 0} schemes). `
    + `${broad} of the top 20 names saw 10+ funds enter together — a stronger consensus signal than one-off entries. `
    + `Leading sectors in the top 20: ${sectorListPhrase(sectors)}.`;
}

export function completeExitsTakeaway(top, exits, latestMonth) {
  const leader = top[0];
  const bankExits = top.filter((r) => /bank/i.test(r.sector || '')).length;
  return `Funds fully sold out of <strong>${exits.length} stocks</strong> in ${escapeHtml(latestMonth)}. `
    + `${escapeHtml(leader?.stockName || 'The largest exit')} had ${leader?.fundCount || 0} schemes go to zero weight. `
    + (bankExits ? `${bankExits} of the top 20 exits were in banking — worth cross-checking if this is sector rotation or stock-specific risk. ` : '')
    + `A complete exit means the fund removed the stock entirely, not just a small trim.`;
}

export function sectorRotationTakeaway(gainers, losers, latestMonth, prevMonth, fundCount) {
  const g = gainers[0];
  const l = losers[0];
  let text = `Across ${fundCount || 'hundreds of'} equity schemes, mutual funds rotated allocation between ${escapeHtml(prevMonth)} and ${escapeHtml(latestMonth)}. `;
  if (g) {
    text += `<strong>${escapeHtml(g.sector)}</strong> saw the largest rise in total sector exposure (+${(g.aumChangePct || 0).toFixed(1)}% AUM change, ${g.fundsIncreasing || 0} funds increasing vs ${g.fundsDecreasing || 0} decreasing). `;
  }
  if (l) {
    text += `On the other side, <strong>${escapeHtml(l.sector)}</strong> lost the most ground (${(l.aumChangePct || 0).toFixed(1)}% AUM change). `;
  }
  text += 'Rising sector AUM can reflect both new buying and price appreciation — use stock-level trackers to separate the two.';
  return text;
}

export function convictionTakeaway(best, byCap, latestMonth) {
  const caps = [...byCap.keys()];
  return `For ${escapeHtml(latestMonth)}, the highest conviction score in our universe is `
    + `<strong>${escapeHtml(best?.stockName || '—')}</strong> (${best?.convictionScore ?? '—'}/100, ${escapeHtml(best?.category || '')}). `
    + `Scores are relative ranks within each cap bucket (${caps.map(escapeHtml).join(', ')}): they measure how active funds were versus peers, not a buy recommendation. `
    + `Pair high scores with net buying funds and fresh entries on the stock detail page before drawing conclusions.`;
}

export function amcTakeaway(amcName, picks, latestMonth) {
  const freshCount = picks.filter((p) => p.funds.some((f) => f.prevPct === 0)).length;
  const top = picks[0];
  return `${escapeHtml(amcName)} funds added or raised stakes in <strong>${picks.length}+ stocks</strong> during ${escapeHtml(latestMonth)} disclosures. `
    + `The largest single move was in <strong>${escapeHtml(top?.stockName || '—')}</strong> (${top?.maxChange?.toFixed(2) || '—'}% weight change). `
    + `${freshCount} of the highlighted names were fresh entries (zero weight last month). `
    + `Below: summary table plus fund-level detail for the top five moves.`;
}

export function overlapTakeaway(hero, month) {
  return `In ${escapeHtml(month)}, <strong>${escapeHtml(hero.fundA)}</strong> and <strong>${escapeHtml(hero.fundB)}</strong> shared `
    + `${(hero.overlap || 0).toFixed(1)}% portfolio overlap (${hero.common} identical holdings). `
    + `If you hold both, you may be paying two expense ratios for nearly the same equity basket — especially risky before tax-loss harvesting or SIP rebalancing.`;
}

export const GLOSSARY = {
  freshEntry: [
    { term: 'Fresh entry', def: 'A stock that had <strong>0% portfolio weight</strong> in a fund last month and appears with a positive weight this month — a new position, not a top-up.' },
    { term: 'Fund count', def: 'Number of mutual fund schemes (not AMCs) that made the move. Higher count = broader institutional interest.' },
    { term: 'Avg new weight', def: 'Average portfolio weight (%) assigned to the stock among funds that entered. Shows how meaningful the position is within each scheme.' },
  ],
  completeExit: [
    { term: 'Complete exit', def: 'A stock that had a positive weight last month and is <strong>fully removed</strong> (0% weight) this month.' },
    { term: 'Prior avg weight', def: 'Average weight the stock had across exiting funds in the previous month — helps gauge how large the position was before the sell-out.' },
  ],
  conviction: [
    { term: 'Conviction score (0–100)', def: 'Ranks how <em>active</em> a stock was versus other stocks in the same market-cap bucket this month. Higher = more institutional activity relative to peers. Not a buy/sell rating.' },
    { term: 'Smart Money Signal', def: 'Direction label (e.g. Moderate Accumulation) based on whether funds were net buyers or sellers, with intensity from the conviction score.' },
    { term: 'Net buying funds', def: '(Funds that increased weight + fresh entries) minus (funds that reduced or exited). Positive = more schemes adding than cutting.' },
  ],
  sector: [
    { term: 'AUM change %', def: 'Month-on-month change in total ₹ value of all fund holdings in that sector. Includes both price moves and active buying/selling.' },
    { term: 'Weight Δ', def: 'Change in the sector\'s share of total disclosed equity holdings, in percentage points.' },
    { term: 'Funds ↑ / ↓', def: 'How many schemes increased vs decreased exposure to the sector this month.' },
  ],
  overlap: [
    { term: 'Portfolio overlap %', def: 'Share of holdings (by weight) that two funds have in common. 50% overlap means half of each portfolio lines up with the other.' },
    { term: 'Common stocks', def: 'Count of identical stock names appearing in both fund portfolios for the comparison month.' },
  ],
  amc: [
    { term: 'Fresh entry vs Increased', def: '<strong>Fresh entry</strong> = new position from zero. <strong>Increased</strong> = fund already held the stock and raised its weight.' },
    { term: 'Portfolio weight %', def: 'Stock value as a percentage of the fund\'s equity NAV — how large the bet is inside that scheme.' },
  ],
  sast: [
    { term: 'SAST', def: 'Significant Acquisition & Substantial Disposal — exchange filings when a shareholder crosses key stake thresholds (typically 2%, 5%, 10%).' },
    { term: 'vs quarterly SHP', def: 'SAST is event-driven and often appears <em>before</em> the formal quarter-end Shareholding Pattern. Treat as preliminary until SHP confirms.' },
  ],
  onePercent: [
    { term: '1% Club', def: 'Anyone holding ≥1% of a listed company must be disclosed in quarterly shareholding pattern filings.' },
    { term: 'Mystery holder', def: 'A ≥1% stakeholder who is not a well-known promoter, mutual fund, or tracked super investor — often an individual or private entity.' },
  ],
};
