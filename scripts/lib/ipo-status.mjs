/**
 * IPO status computation (mirrors src/utils/ipo-status.ts for pipelines)
 * See lifecycle diagram: DRHP → UPCOMING → OPEN → LIVE → CLOSED → ALLOTMENT → LISTED
 */

function parseIPODate(dateStr, rejectRanges = false) {
  if (!dateStr || String(dateStr).trim() === '') return null;
  const s = String(dateStr).trim();

  if (rejectRanges) {
    const rangePattern = /\d{1,2}(?:st|nd|rd|th)?\s*[–\-]\s*\d{1,2}(?:st|nd|rd|th)?/;
    if (rangePattern.test(s)) return null;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10) + 'T12:00:00');
    if (!isNaN(d.getTime())) return d;
  }

  let d = new Date(s);
  if (!isNaN(d.getTime())) {
    d.setHours(12, 0, 0, 0);
    return d;
  }

  const ordinalPattern = /(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})/g;
  const matches = [...s.matchAll(ordinalPattern)];
  if (matches.length > 0) {
    if (rejectRanges && matches.length > 1) return null;
    const last = matches[matches.length - 1];
    d = new Date(`${last[1]} ${last[2]} ${last[3]}T12:00:00`);
    if (!isNaN(d.getTime())) return d;
  }

  const dmyPattern = /(\d{2})[-/](\d{2})[-/](\d{4})/;
  const dmyMatch = s.match(dmyPattern);
  if (dmyMatch) {
    d = new Date(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10), 12);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

export function computeIPOStatus(ipo) {
  if (ipo.status === 'failed') return 'failed';
  if (ipo.status === 'withdrawn') return 'withdrawn';

  const now = new Date();
  now.setHours(12, 0, 0, 0);

  const openDate = parseIPODate(ipo.openDate);
  const closeDate = parseIPODate(ipo.closeDate);
  const allotmentDate = parseIPODate(ipo.allotmentDate, true);
  const listingDate = parseIPODate(ipo.listingDate, true);

  if (listingDate && now >= listingDate) return 'listed';
  if (allotmentDate && now >= allotmentDate) return 'allotment';
  if (closeDate && now > closeDate) return 'closed';

  if (!openDate) {
    return ipo.status === 'drhp-filed' ? 'drhp-filed' : 'upcoming';
  }

  if (openDate && closeDate && now >= openDate && now <= closeDate) return 'live';

  if (openDate) {
    const twoDaysBefore = new Date(openDate);
    twoDaysBefore.setDate(twoDaysBefore.getDate() - 2);
    if (now >= twoDaysBefore && now < openDate) return 'open';
  }

  if (openDate && now < openDate) return 'upcoming';

  return ipo.status || 'upcoming';
}

export function applyComputedStatuses(ipos) {
  return ipos.map((ipo) => ({ ...ipo, status: computeIPOStatus(ipo) }));
}
