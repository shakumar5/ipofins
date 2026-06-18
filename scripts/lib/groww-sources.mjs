/**
 * Groww IPO listing, subscription, and detail pages
 */

import {
  fetchHTML,
  slugify,
  fuzzyMatch,
  tsToISO,
  formatIssueSizeCr,
  sleep,
} from './ipo-utils.mjs';

function parseNextData(html) {
  const match = html.match(/__NEXT_DATA__[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('__NEXT_DATA__ not found');
  return JSON.parse(match[1]);
}

function growwSlugFromSearchId(searchId, companyName) {
  if (searchId) return searchId.replace(/-ipo$/, '');
  return slugify(companyName);
}

function mapGrowwOpenItem(item) {
  const cat = item.categories?.[0];
  const priceMin = cat?.minPrice ?? null;
  const priceMax = cat?.maxPrice ?? null;
  return {
    name: item.companyName,
    slug: growwSlugFromSearchId(item.searchId, item.companyName),
    growwSlug: item.searchId,
    symbol: item.symbol,
    type: item.isSme ? 'sme' : 'mainboard',
    status: 'live',
    priceMin,
    priceMax,
    priceRange:
      priceMin && priceMax && priceMax > priceMin
        ? `${priceMin}-${priceMax}`
        : priceMax
          ? String(priceMax)
          : '',
    lotSize: cat?.lotSize ?? null,
    openDate: tsToISO(item.bidStartTimestamp),
    closeDate: tsToISO(item.bidEndTimestamp),
    subscription: item.overallSubscription > 0 ? item.overallSubscription : null,
    issueSize: null,
    drhpUrl: null,
    source: 'groww',
  };
}

function mapGrowwUpcomingItem(item) {
  return {
    name: item.companyName,
    slug: growwSlugFromSearchId(item.searchId, item.companyName),
    growwSlug: item.searchId,
    symbol: item.symbol,
    type: item.isSme ? 'sme' : 'mainboard',
    status: 'upcoming',
    openDate: item.bidStartTimestamp ? tsToISO(item.bidStartTimestamp) : null,
    drhpUrl: item.documentUrl || null,
    source: 'groww',
  };
}

function mapGrowwClosedItem(item) {
  const issuePrice = item.issuePrice ?? null;
  return {
    name: item.companyName,
    slug: growwSlugFromSearchId(item.searchId, item.companyName),
    growwSlug: item.searchId,
    symbol: item.symbol,
    type: item.isSme ? 'sme' : 'mainboard',
    status: item.isListed ? 'listed' : 'closed',
    priceMin: issuePrice,
    priceMax: issuePrice,
    priceRange: issuePrice ? String(issuePrice) : '',
    openDate: item.openingDate ? tsToISO(item.openingDate) : null,
    closeDate: item.closingDate ? tsToISO(item.closingDate) : null,
    listingDate: item.listingTimestamp ? tsToISO(item.listingTimestamp) : null,
    listingPrice: item.listingPrice ?? null,
    subscription: item.overallSubscription > 0 ? item.overallSubscription : null,
    drhpUrl: item.rtaLink || null,
    source: 'groww',
  };
}

export async function fetchGrowwListing() {
  console.log('\n  📊 [Groww] Fetching IPO dashboard...');
  const html = await fetchHTML('https://groww.in/ipo');
  const pageProps = parseNextData(html).props?.pageProps;
  if (!pageProps) throw new Error('No pageProps in Groww IPO page');

  const open = (pageProps.openDataList || []).map(mapGrowwOpenItem);
  const upcoming = (pageProps.upcomingDataList || []).map(mapGrowwUpcomingItem);
  const closed = (pageProps.closedDataList || []).map(mapGrowwClosedItem);

  console.log(
    `    ✅ Open: ${open.length} | Upcoming: ${upcoming.length} | Closed: ${closed.length}`
  );
  return { open, upcoming, closed };
}

export async function fetchGrowwSubscription() {
  console.log('\n  👥 [Groww] Fetching subscription data...');
  try {
    const html = await fetchHTML('https://groww.in/ipo/subscription');
    const dataList = parseNextData(html).props?.pageProps?.dataList;
    if (!Array.isArray(dataList)) throw new Error('No dataList');

    const results = [];
    for (const ipo of dataList) {
      if (!ipo.companyName || !ipo.searchId) continue;
      const entry = {
        name: ipo.companyName,
        growwSlug: ipo.searchId,
        retail: null,
        nii: null,
        qib: null,
        employee: null,
        total: ipo.overallSubscription || null,
      };
      for (const rate of ipo.subscriptionRates || []) {
        const val = Math.round(rate.subscriptionRate * 100) / 100;
        switch (rate.category) {
          case 'RETAIL':
            entry.retail = val;
            break;
          case 'NII':
            entry.nii = val;
            break;
          case 'QIB':
            entry.qib = val;
            break;
          case 'EMPLOYEE':
            entry.employee = val;
            break;
          case 'TOTAL':
            entry.total = val;
            break;
        }
      }
      if (entry.total > 0 || entry.retail || entry.nii || entry.qib) {
        results.push(entry);
      }
    }
    console.log(`    ✅ Subscription data for ${results.length} IPOs`);
    return results;
  } catch (err) {
    console.log(`    ⚠️ Groww subscription failed: ${err.message}`);
    return [];
  }
}

export async function fetchGrowwIPODetail(growwSlug, ipoName) {
  const base = growwSlug?.endsWith('-ipo') ? growwSlug.slice(0, -4) : growwSlug;
  const stripSuffixes = [
    '-india',
    '-limited',
    '-ltd',
    '-pvt',
    '-private',
    '-industries',
    '-india-limited',
    '-india-ltd',
  ];

  const candidates = [`${base}-ipo`];
  for (const suffix of stripSuffixes) {
    if (base?.endsWith(suffix)) {
      candidates.push(`${base.slice(0, -suffix.length)}-ipo`);
      break;
    }
  }
  const seen = new Set();
  const unique = candidates.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));

  let html = null;
  for (const slug of unique) {
    try {
      const response = await fetchHTML(`https://groww.in/ipo/${slug}`);
      if (response.length >= 3000 && !response.includes('"_notFoundPage"')) {
        html = response;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!html) return null;

  const ipo = parseNextData(html).props?.pageProps?.ipoData;
  if (!ipo) return null;

  const cat = ipo.categories?.[0];
  const detail = {
    name: ipo.companyShortName || ipo.companyName || ipoName,
    drhpUrl: ipo.documentUrl || null,
    registrar: ipo.registrar?.name || ipo.registrar || null,
    description: ipo.aboutCompany?.aboutCompany?.slice(0, 2000) || null,
    founders: ipo.aboutCompany?.managingDirector || null,
    founded: ipo.aboutCompany?.yearFounded || null,
    headquarters: null,
    sector: ipo.sector || null,
    highlights: (ipo.pros || []).map((p) => p.slice(0, 200)).slice(0, 5),
    risks: (ipo.cons || []).map((c) => c.slice(0, 200)).slice(0, 5),
    listingPrice: ipo.listing?.listingPrice || null,
    lotSize: ipo.lotSize || cat?.lotSize || null,
    priceMin: ipo.minPrice ?? cat?.minPrice ?? null,
    priceMax: ipo.maxPrice ?? cat?.maxPrice ?? null,
    issueSize: formatIssueSizeCr(ipo.issueSize),
    openDate: ipo.startDate || null,
    closeDate: ipo.endDate || null,
    growwSlug: growwSlug,
    source: 'groww',
  };

  const city = ipo.aboutCompany?.city || ipo.aboutCompany?.headquarterCity;
  const state = ipo.aboutCompany?.state || ipo.aboutCompany?.headquarterState;
  if (city && state) detail.headquarters = `${city}, ${state}`;
  else if (city) detail.headquarters = city;

  if (detail.priceMin && detail.priceMax) {
    detail.priceRange =
      detail.priceMin !== detail.priceMax
        ? `${detail.priceMin}-${detail.priceMax}`
        : String(detail.priceMax);
  }

  if (ipo.subscriptionRates?.length) {
    detail.subscriptionDetails = {};
    for (const rate of ipo.subscriptionRates) {
      const val = Math.round(rate.subscriptionRate * 100) / 100;
      if (rate.category === 'RETAIL') detail.subscriptionDetails.retail = val;
      if (rate.category === 'NII') detail.subscriptionDetails.nii = val;
      if (rate.category === 'QIB') detail.subscriptionDetails.qib = val;
      if (rate.category === 'TOTAL') detail.subscription = val;
    }
  }

  return detail;
}

export function mergeGrowwDetailInto(target, detail) {
  if (!detail) return target;

  if (detail.drhpUrl && !detail.drhpUrl.includes('zerodha.com')) {
    target.drhpUrl = detail.drhpUrl;
  }
  if (detail.registrar && !target.registrar) target.registrar = detail.registrar;
  if (detail.founders && !target.founders) target.founders = detail.founders;
  if (detail.founded && !target.founded) target.founded = detail.founded;
  if (detail.headquarters && !target.headquarters) target.headquarters = detail.headquarters;
  if (detail.sector && (!target.sector || target.sector === 'Others')) target.sector = detail.sector;

  if (
    detail.description &&
    (!target.description || target.description.length < detail.description.length)
  ) {
    target.description = detail.description;
  }
  if (detail.lotSize && (!target.lotSize || target.lotSize < 50)) target.lotSize = detail.lotSize;
  if (detail.priceRange && (!target.priceRange || Number(target.priceMax) < 50)) {
    target.priceRange = detail.priceRange;
    target.priceMin = detail.priceMin;
    target.priceMax = detail.priceMax;
  }
  if (detail.issueSize && !target.issueSize) target.issueSize = detail.issueSize;
  if (detail.openDate && !target.openDate) target.openDate = detail.openDate;
  if (detail.closeDate && !target.closeDate) target.closeDate = detail.closeDate;
  if (detail.listingPrice && !target.listingPrice) target.listingPrice = detail.listingPrice;
  if (detail.highlights?.length) target.highlights = detail.highlights;
  if (detail.risks?.length) {
    target.risks = detail.risks;
    target.riskScore = Math.min(10, 4 + detail.risks.length);
  }
  if (detail.growwSlug) target.growwSlug = detail.growwSlug;
  if (detail.subscription) target.subscription = detail.subscription;
  if (detail.subscriptionDetails) target.subscriptionDetails = detail.subscriptionDetails;

  return target;
}

export async function enrichGrowwDetails(ipos, subscriptionEntries = [], { delayMs = 600 } = {}) {
  const subByName = new Map(subscriptionEntries.map((s) => [s.name, s]));
  console.log(`\n  📄 [Groww] Enriching detail pages for ${ipos.length} IPOs...`);

  for (const ipo of ipos) {
    const subEntry =
      subByName.get(ipo.name) ||
      [...subByName.values()].find((s) => fuzzyMatch(s.name, ipo.name));
    const growwSlug = ipo.growwSlug || subEntry?.growwSlug || `${slugify(ipo.name)}-ipo`;
    const detail = await fetchGrowwIPODetail(growwSlug, ipo.name);
    if (detail) mergeGrowwDetailInto(ipo, detail);
    await sleep(delayMs);
  }
  return ipos;
}
