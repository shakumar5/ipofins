/**
 * Zerodha IPO listing + detail pages
 * https://zerodha.com/ipo/
 */

import { fetchHTML, slugify, sleep, sanitizeIpoText } from './ipo-utils.mjs';

function extractSection(html, startId, endId) {
  const startIdx = html.indexOf(`id="${startId}"`);
  if (startIdx === -1) return '';
  const endIdx = endId ? html.indexOf(`id="${endId}"`, startIdx) : html.length;
  if (endIdx === -1) return html.substring(startIdx);
  return html.substring(startIdx, endIdx);
}

function parseListingSection(sectionHtml, status) {
  const ipos = [];
  const rows = [...sectionHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const seen = new Set();

  for (const row of rows) {
    const rowHtml = row[1];
    const linkMatch = rowHtml.match(/href="\/ipo\/(\d+)\/([^"]+)"/);
    if (!linkMatch) continue;

    const ipoId = linkMatch[1];
    const ipoSlug = linkMatch[2];
    if (seen.has(ipoSlug)) continue;
    seen.add(ipoSlug);
    const nameMatch = rowHtml.match(/ipo-name[^>]*>([^<]+)/);
    const typeMatch = rowHtml.match(/ipo-type[^>]*>([^<]+)/);
    const priceMatch = rowHtml.match(
      /₹(\d[\d,]*)\s*(?:&ndash;|–|-)\s*₹(\d[\d,]*)|₹(\d[\d,]*)/
    );

    const name = nameMatch ? nameMatch[1].trim() : ipoSlug.replace(/-/g, ' ');
    const typeRaw = typeMatch ? typeMatch[1].trim().toLowerCase() : 'sme';

    let priceMin = null;
    let priceMax = null;
    if (priceMatch) {
      if (priceMatch[1] && priceMatch[2]) {
        priceMin = parseInt(priceMatch[1].replace(/,/g, ''), 10);
        priceMax = parseInt(priceMatch[2].replace(/,/g, ''), 10);
      } else if (priceMatch[3]) {
        priceMin = priceMax = parseInt(priceMatch[3].replace(/,/g, ''), 10);
      }
    }

    const slug = status === 'upcoming' ? slugify(name) : ipoSlug;
    ipos.push({
      name,
      slug,
      type: typeRaw.includes('main') ? 'mainboard' : 'sme',
      status,
      priceRange:
        priceMin && priceMax && priceMax > priceMin
          ? `${priceMin}-${priceMax}`
          : priceMin
            ? String(priceMin)
            : '',
      priceMin,
      priceMax,
      detailUrl: `https://zerodha.com/ipo/${ipoId}/${ipoSlug}`,
      lotSize: null,
      issueSize: null,
      openDate: null,
      closeDate: null,
      allotmentDate: null,
      listingDate: null,
      sector: null,
      description: null,
      purpose: null,
      highlights: [],
      risks: [],
      drhpUrl: null,
      registrar: null,
      founders: null,
      headquarters: null,
      founded: null,
      listingPrice: null,
      subscription: null,
      riskScore: 5,
      source: 'zerodha',
    });
  }

  return ipos;
}

export function parseZerodhaListing(html) {
  const live = parseListingSection(extractSection(html, 'live-ipo', 'upcoming-ipo'), 'live');
  const upcoming = parseListingSection(
    extractSection(html, 'upcoming-ipo', 'closed-ipo'),
    'upcoming'
  );
  const closed = parseListingSection(extractSection(html, 'closed-ipo', '</main>'), 'closed');
  return { live, upcoming, closed };
}

export async function fetchZerodhaListing() {
  console.log('\n  📈 [Zerodha] Fetching IPO listing...');
  const html = await fetchHTML('https://zerodha.com/ipo/');
  if (html.length < 5000 || html.includes('challenge-platform')) {
    throw new Error('Zerodha page blocked or empty');
  }
  const { live, upcoming, closed } = parseZerodhaListing(html);
  console.log(
    `    ✅ Live: ${live.length} | Upcoming: ${upcoming.length} | Closed: ${closed.length}`
  );
  return { live, upcoming, closed };
}

export async function fetchZerodhaIPODetail(ipo) {
  if (!ipo.detailUrl) return ipo;
  try {
    const html = await fetchHTML(ipo.detailUrl);
    if (html.length < 3000) return ipo;

    const clean = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    const h1Match = clean.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match) {
      const detailName = h1Match[1]
        .replace(/<[^>]+>/g, '')
        .replace(/\s*IPO\s*$/i, '')
        .trim();
      if (detailName && detailName.length > 3 && detailName !== ipo.name) {
        ipo.name = detailName;
        if (ipo.status !== 'live') ipo.slug = slugify(detailName);
      }
    }

    const scheduleTable = clean.match(/Schedule[\s\S]*?<table[\s\S]*?<\/table>/i);
    if (scheduleTable) {
      const rows = [...scheduleTable[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
      for (const row of rows) {
        const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
        if (cells.length < 2) continue;
        const label = cells[0][1].replace(/<[^>]+>/g, '').trim().toLowerCase();
        const value = cells[1][1].replace(/<[^>]+>/g, '').trim();
        if (label.includes('issue open') || label.includes('open date')) ipo.openDate = value;
        else if (label.includes('issue close') || label.includes('close date'))
          ipo.closeDate = value;
        else if (label.includes('allotment')) ipo.allotmentDate = value;
        else if (label.includes('listing date')) ipo.listingDate = value;
      }
    }

    const priceMatch = clean.match(/Price range[\s\S]*?<div class="value">([\s\S]*?)<\/div>/i);
    if (priceMatch && (!ipo.priceRange || Number(ipo.priceMax) < 50)) {
      const priceStr = priceMatch[1].replace(/<[^>]+>/g, '').trim();
      const prices = [...priceStr.matchAll(/₹?(\d[\d,]*)/g)];
      if (prices.length >= 2) {
        ipo.priceMin = parseInt(prices[0][1].replace(/,/g, ''), 10);
        ipo.priceMax = parseInt(prices[1][1].replace(/,/g, ''), 10);
        ipo.priceRange = `${ipo.priceMin}-${ipo.priceMax}`;
      } else if (prices.length === 1) {
        ipo.priceMin = ipo.priceMax = parseInt(prices[0][1].replace(/,/g, ''), 10);
        ipo.priceRange = String(ipo.priceMin);
      }
    }

    const lotMatch = clean.match(/Lot size[\s\S]*?<div class="value">([\s\S]*?)<\/div>/i);
    if (lotMatch && !ipo.lotSize) {
      const lotNum = lotMatch[1].match(/(\d[\d,]*)/);
      if (lotNum) ipo.lotSize = parseInt(lotNum[1].replace(/,/g, ''), 10);
    }
    if (!ipo.lotSize) {
      const inlineLot = clean.match(/Lot size[^0-9]*(\d[\d,]*)/i);
      if (inlineLot) {
        const lotVal = parseInt(inlineLot[1].replace(/,/g, ''), 10);
        if (lotVal >= 50 && lotVal <= 10000) ipo.lotSize = lotVal;
      }
    }

    const issueSizeMatch = clean.match(/Issue size[\s\S]*?<div class="value">([\s\S]*?)<\/div>/i);
    if (issueSizeMatch) {
      const sizeStr = issueSizeMatch[1].replace(/<[^>]+>/g, '').trim();
      const cleaned = sanitizeIpoText(sizeStr);
      if (cleaned) {
        ipo.issueSize = cleaned.includes('cr') ? `₹${cleaned.replace(/₹/g, '')}` : cleaned;
      }
    }

    const aboutMatch = clean.match(
      /About\s+[\w\s]+<\/h2>\s*([\s\S]*?)(?=<h2|<div class="row ipo-meta|$)/i
    );
    if (aboutMatch) {
      const desc = aboutMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (desc.length > 30) ipo.description = desc.slice(0, 2000);
    }

    const strengthsMatch = clean.match(/Strengths[\s\S]*?(<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>)/i);
    if (strengthsMatch) {
      const items = [...strengthsMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
      ipo.highlights = items
        .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
        .filter((s) => s.length > 10)
        .slice(0, 5);
    }

    const risksMatch = clean.match(/Risks[\s\S]*?(<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>)/i);
    if (risksMatch) {
      const items = [...risksMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
      ipo.risks = items
        .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
        .filter((s) => s.length > 10)
        .slice(0, 5);
    }

    const listingPriceMatch = clean.match(
      /(?:Listed at|Listing price|Listing day open)[^₹]*₹\s*(\d[\d,]*\.?\d*)/i
    );
    if (listingPriceMatch) {
      ipo.listingPrice = parseFloat(listingPriceMatch[1].replace(/,/g, ''));
    }

    if (ipo.risks?.length) ipo.riskScore = Math.min(10, 4 + ipo.risks.length);

    return ipo;
  } catch (err) {
    console.log(`      ⚠️ ${ipo.name}: Zerodha detail failed (${err.message})`);
    return ipo;
  }
}

export async function enrichZerodhaDetails(ipos, { delayMs = 800 } = {}) {
  const withUrl = ipos.filter((i) => i.detailUrl);
  console.log(`\n  📄 [Zerodha] Enriching ${withUrl.length} detail pages...`);
  for (const ipo of withUrl) {
    await fetchZerodhaIPODetail(ipo);
    await sleep(delayMs);
  }
  return ipos;
}
