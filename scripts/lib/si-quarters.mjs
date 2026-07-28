/**
 * Calendar quarter helpers for Super Investors SHP pipeline.
 * Shareholding Pattern filings use calendar quarters (Jan–Mar, Apr–Jun, …).
 *
 * SEBI: SHP due within 21 days of quarter-end.
 *   - quarterFilingWindowEnd: +25 days — earliest technical ingest (optional catch-up).
 *   - quarterPublicationReady: +40 days — ~70%+ of listings filed; used by cron.
 * GitHub cron runs on the 12th of Feb/May/Aug/Nov (see pipeline-quarterly-super-investors.yml).
 */

/** Quarter start dates for a calendar year (ISO YYYY-MM-DD). */
export function calendarQuartersForYear(year) {
  return [`${year}-01-01`, `${year}-04-01`, `${year}-07-01`, `${year}-10-01`];
}

function daysAfterQuarterEnd(quarterStart, extraDays) {
  const d = new Date(quarterStart);
  const endMonth = d.getMonth() + 2; // Mar/Jun/Sep/Dec
  const endYear = d.getFullYear() + (endMonth > 11 ? 1 : 0);
  const end = new Date(endYear, endMonth % 12 + 1, 0);
  end.setDate(end.getDate() + extraDays);
  return end;
}

function quarterFilingWindowEnd(quarterStart) {
  return daysAfterQuarterEnd(quarterStart, 25);
}

/** When cron should run a full ingest + quality gate (most listings filed). */
export function quarterPublicationReady(quarterStart) {
  return daysAfterQuarterEnd(quarterStart, 40);
}

export function isQuarterPublicationReady(quarterStart, now = new Date()) {
  return now >= quarterPublicationReady(quarterStart);
}

/**
 * Most recent quarter whose SEBI filing window (+25 days after quarter-end) has passed.
 */
export function inferLatestQuarter(now = new Date()) {
  const year = now.getFullYear();
  const candidates = [
    ...calendarQuartersForYear(year),
    ...calendarQuartersForYear(year - 1),
  ].sort((a, b) => b.localeCompare(a));

  for (const q of candidates) {
    if (now >= quarterFilingWindowEnd(q)) return q;
  }
  return candidates[candidates.length - 1];
}

/**
 * Most recent quarter ready for full cron ingest (publication window passed).
 * On Jul 28 this is still 2026-01-01; 2026-04-01 becomes ready ~Aug 9.
 */
export function inferLatestPublicationQuarter(now = new Date()) {
  const year = now.getFullYear();
  const candidates = [
    ...calendarQuartersForYear(year),
    ...calendarQuartersForYear(year - 1),
  ].sort((a, b) => b.localeCompare(a));

  for (const q of candidates) {
    if (now >= quarterPublicationReady(q)) return q;
  }
  return candidates[candidates.length - 1];
}

/** Last N filed calendar quarters, newest first (includes inferLatestQuarter). */
export function recentCalendarQuarters(count = 4, now = new Date()) {
  const latest = inferLatestQuarter(now);
  const out = [latest];
  let cursor = new Date(latest);

  while (out.length < count) {
    cursor.setMonth(cursor.getMonth() - 3);
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const qStart = m < 3 ? `${y}-01-01` : m < 6 ? `${y}-04-01` : m < 9 ? `${y}-07-01` : `${y}-10-01`;
    if (out.includes(qStart)) break;
    out.push(qStart);
  }

  return out.slice(0, count);
}

const NSE_MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** NSE SHP `date` field uses quarter-end e.g. "31-MAR-2026" (same convention as Trendlyne). */
export function nseQuarterEndLabel(quarterStart) {
  const iso = String(quarterStart).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return '';
  const year = parseInt(iso[1], 10);
  const startMonth = parseInt(iso[2], 10) - 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth + 1, 0).getDate();
  return `${String(lastDay).padStart(2, '0')}-${NSE_MONTH_NAMES[endMonth]}-${year}`;
}

/** Human label e.g. "Mar 2026" (quarter-end month, as used in SHP filings). */
export function formatQuarterLabel(quarterStart) {
  if (!quarterStart) return '—';
  const iso = String(quarterStart).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? quarterStart;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = parseInt(m[1], 10);
    const startMonth = parseInt(m[2], 10);
    const starts = new Set([1, 4, 7, 10]);
    if (parseInt(m[3], 10) === 1 && starts.has(startMonth)) {
      return `${monthNames[startMonth + 1]} ${year}`;
    }
    return `${monthNames[startMonth - 1]} ${year}`;
  }
  const d = new Date(quarterStart);
  if (Number.isNaN(d.getTime())) return quarterStart;
  return d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}
