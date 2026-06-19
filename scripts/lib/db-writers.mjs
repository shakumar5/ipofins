/**
 * Write pipeline results directly to Neon PostgreSQL.
 * No JSON files are written to disk.
 */

import { sql, isDbConfigured } from './db.mjs';
import { slugify } from './ipo-utils.mjs';
import { buildFundMatcher } from './fund-match.mjs';
import {
  indexTerRecords,
  normalizeTerSchemeName,
  terForDbFund,
} from './amfi-ter.mjs';
import {
  bulkUpsertFundNavs,
  bulkUpsertAmfiFunds,
  bulkAssignSchemeCodes,
  computeFundReturnsBulk,
  closePgPool,
} from './pg-bulk.mjs';

export function requireDb() {
  if (!isDbConfigured()) {
    throw new Error(
      'DATABASE_URL is not set. Add it to .env before running pipelines.\n' +
        'Market data is stored in Neon — not committed to Git.'
    );
  }
}

// ─── Mutual Funds ────────────────────────────────────────────

export async function upsertFundsFromAMFI(funds) {
  requireDb();
  const t0 = Date.now();

  const allFunds = await sql`
    SELECT id, slug, name, scheme_code, amc_id FROM funds WHERE is_active = true
  `;
  const amcRows = await sql`SELECT id, name, slug FROM amcs`;
  const resolveFund = buildFundMatcher(allFunds, amcRows);

  const bySchemeCode = new Map();
  const bySlug = new Map();
  const schemeCodeOwner = new Map();
  for (const f of allFunds) {
    bySlug.set(f.slug, f);
    if (f.scheme_code) {
      bySchemeCode.set(f.scheme_code, f);
      schemeCodeOwner.set(f.scheme_code, f.id);
    }
  }

  const navRows = [];
  const navKeySeen = new Set();
  const schemeCodeUpdates = [];
  const newFunds = [];
  let matcherHits = 0;
  let errors = 0;

  const defaultDate = new Date().toISOString().slice(0, 10);

  for (const fund of funds) {
    try {
      const navTargets = new Set();
      const navDate = fund.navDate || defaultDate;

      const matchedId = resolveFund(fund.slug, { name: fund.name, amc: fund.amc || '' });
      if (matchedId) {
        navTargets.add(matchedId);
        matcherHits++;
      }

      const byCode = bySchemeCode.get(fund.schemeCode);
      const bySlugRow = bySlug.get(fund.slug);

      if (byCode) navTargets.add(byCode.id);
      if (bySlugRow) {
        navTargets.add(bySlugRow.id);
        if (!bySlugRow.scheme_code && fund.schemeCode && !schemeCodeOwner.has(fund.schemeCode)) {
          schemeCodeUpdates.push({ fundId: bySlugRow.id, schemeCode: fund.schemeCode });
          schemeCodeOwner.set(fund.schemeCode, bySlugRow.id);
          bySlugRow.scheme_code = fund.schemeCode;
          bySchemeCode.set(fund.schemeCode, bySlugRow);
        }
      }

      if (navTargets.size === 0) {
        newFunds.push(fund);
      }

      if (fund.nav > 0) {
        for (const fundId of navTargets) {
          const key = `${fundId}|${navDate}`;
          if (navKeySeen.has(key)) continue;
          navKeySeen.add(key);
          navRows.push({ fund_id: fundId, date: navDate, nav: fund.nav });
        }
      }
    } catch (err) {
      errors++;
      console.error(`    ❌ Fund ${fund.name}: ${err.message}`);
    }
  }

  if (schemeCodeUpdates.length > 0) {
    await bulkAssignSchemeCodes(schemeCodeUpdates);
  }

  if (newFunds.length > 0) {
    const codeToId = await bulkUpsertAmfiFunds(newFunds);
    for (const fund of newFunds) {
      const fundId = codeToId.get(fund.schemeCode);
      if (!fundId || fund.nav <= 0) continue;
      const navDate = fund.navDate || defaultDate;
      const key = `${fundId}|${navDate}`;
      if (navKeySeen.has(key)) continue;
      navKeySeen.add(key);
      navRows.push({ fund_id: fundId, date: navDate, nav: fund.nav });
    }
  }

  const navCount = await bulkUpsertFundNavs(navRows);
  await closePgPool();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `    ✅ Upserted ${funds.length} funds, wrote ${navCount} NAV rows (${matcherHits} via matcher) in ${elapsed}s` +
      (errors ? ` — ${errors} errors` : '')
  );
  return funds.length;
}

/** Compute 1Y/3Y/5Y CAGR from fund_navs history (single bulk SQL). */
export async function computeFundReturnsFromNavs() {
  requireDb();
  const t0 = Date.now();
  const count = await computeFundReturnsBulk();
  await closePgPool();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`    ✅ Computed returns for ${count} funds in ${elapsed}s`);
  return count;
}

// ─── IPOs ────────────────────────────────────────────────────

/** Wipe all IPO-related tables (fresh broker sync) */
export async function clearIPOData() {
  requireDb();
  await sql`DELETE FROM ipo_gmp_history`;
  await sql`DELETE FROM ipo_subscriptions`;
  await sql`DELETE FROM ipo_performance`;
  await sql`DELETE FROM ipo_allotment_stats`;
  await sql`DELETE FROM ipos`;
  console.log('    ✅ Cleared all IPO tables');
}

function parsePriceRange(priceRange) {
  if (!priceRange) return { min: null, max: null };
  const match = priceRange.match(/([\d,.]+)\s*[-–to]+\s*([\d,.]+)/i);
  if (match) {
    return {
      min: parseFloat(match[1].replace(/,/g, '')),
      max: parseFloat(match[2].replace(/,/g, '')),
    };
  }
  const single = parseFloat(priceRange.replace(/[^\d.]/g, ''));
  return { min: single || null, max: single || null };
}

export async function upsertIPOs(ipoList) {
  requireDb();
  let count = 0;

  for (const ipo of ipoList) {
    if (!ipo.name || !ipo.slug) continue;
    const priceMin = ipo.priceMin ?? parsePriceRange(ipo.priceRange).min;
    const priceMax = ipo.priceMax ?? parsePriceRange(ipo.priceRange).max;
    const drhpUrl =
      ipo.drhpUrl && !String(ipo.drhpUrl).includes('zerodha.com') ? ipo.drhpUrl : null;

    try {
      await sql`
        INSERT INTO ipos (
          slug, name, type, status, price_range, price_min, price_max,
          lot_size, issue_size, open_date, close_date, allotment_date, listing_date,
          sector, registrar, founders, headquarters, founded,
          drhp_url, description, purpose, highlights, risks, risk_score, last_updated
        ) VALUES (
          ${ipo.slug}, ${ipo.name}, ${ipo.type || 'mainboard'}, ${ipo.status || 'upcoming'},
          ${ipo.priceRange || null}, ${priceMin}, ${priceMax},
          ${ipo.lotSize ?? null}, ${ipo.issueSize ?? null},
          ${ipo.openDate || null}, ${ipo.closeDate || null},
          ${ipo.allotmentDate || null}, ${ipo.listingDate || null},
          ${ipo.sector || null}, ${ipo.registrar || null},
          ${ipo.founders || null}, ${ipo.headquarters || null}, ${ipo.founded || null},
          ${drhpUrl}, ${ipo.description || null}, ${ipo.purpose || null},
          ${ipo.highlights || []}, ${ipo.risks || []},
          ${ipo.riskScore ?? 5}, NOW()
        )
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          status = EXCLUDED.status,
          price_range = COALESCE(EXCLUDED.price_range, ipos.price_range),
          price_min = COALESCE(EXCLUDED.price_min, ipos.price_min),
          price_max = COALESCE(EXCLUDED.price_max, ipos.price_max),
          lot_size = COALESCE(EXCLUDED.lot_size, ipos.lot_size),
          issue_size = COALESCE(EXCLUDED.issue_size, ipos.issue_size),
          open_date = COALESCE(EXCLUDED.open_date, ipos.open_date),
          close_date = COALESCE(EXCLUDED.close_date, ipos.close_date),
          allotment_date = COALESCE(EXCLUDED.allotment_date, ipos.allotment_date),
          listing_date = COALESCE(EXCLUDED.listing_date, ipos.listing_date),
          sector = COALESCE(EXCLUDED.sector, ipos.sector),
          registrar = COALESCE(EXCLUDED.registrar, ipos.registrar),
          founders = COALESCE(EXCLUDED.founders, ipos.founders),
          headquarters = COALESCE(EXCLUDED.headquarters, ipos.headquarters),
          founded = COALESCE(EXCLUDED.founded, ipos.founded),
          drhp_url = COALESCE(EXCLUDED.drhp_url, ipos.drhp_url),
          description = COALESCE(EXCLUDED.description, ipos.description),
          purpose = COALESCE(EXCLUDED.purpose, ipos.purpose),
          highlights = CASE WHEN array_length(EXCLUDED.highlights, 1) > 0 THEN EXCLUDED.highlights ELSE ipos.highlights END,
          risks = CASE WHEN array_length(EXCLUDED.risks, 1) > 0 THEN EXCLUDED.risks ELSE ipos.risks END,
          risk_score = EXCLUDED.risk_score,
          last_updated = NOW()
      `;

      if (ipo.listingPrice) {
        const [{ id: ipoId }] = await sql`SELECT id FROM ipos WHERE slug = ${ipo.slug}`;
        if (ipoId) {
          await sql`
            INSERT INTO ipo_performance (ipo_id, issue_price, listing_price, last_updated)
            VALUES (${ipoId}, ${priceMax}, ${ipo.listingPrice}, NOW())
            ON CONFLICT (ipo_id) DO UPDATE SET
              issue_price = COALESCE(EXCLUDED.issue_price, ipo_performance.issue_price),
              listing_price = COALESCE(EXCLUDED.listing_price, ipo_performance.listing_price),
              last_updated = NOW()
          `;
        }
      }

      count++;
    } catch (err) {
      console.error(`    ❌ IPO ${ipo.name}: ${err.message}`);
    }
  }

  console.log(`    ✅ Upserted ${count} IPOs`);
  return count;
}

/** Write subscription rows from merged IPO objects */
export async function upsertIPOSubscriptionsFromIPOs(ipoList) {
  requireDb();
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;

  for (const ipo of ipoList) {
    const sub = ipo.subscriptionDetails;
    const total = ipo.subscription ?? sub?.total;
    if (!total && !sub?.retail && !sub?.nii && !sub?.qib) continue;

    try {
      const rows = await sql`SELECT id FROM ipos WHERE slug = ${ipo.slug}`;
      if (rows.length === 0) continue;
      const ipoId = rows[0].id;

      await sql`
        INSERT INTO ipo_subscriptions (
          ipo_id, date, retail_times, nii_times, qib_times, total_times
        ) VALUES (
          ${ipoId}, ${today},
          ${sub?.retail ?? null}, ${sub?.nii ?? null},
          ${sub?.qib ?? null}, ${total ?? null}
        )
        ON CONFLICT (ipo_id, date) DO UPDATE SET
          retail_times = COALESCE(EXCLUDED.retail_times, ipo_subscriptions.retail_times),
          nii_times = COALESCE(EXCLUDED.nii_times, ipo_subscriptions.nii_times),
          qib_times = COALESCE(EXCLUDED.qib_times, ipo_subscriptions.qib_times),
          total_times = COALESCE(EXCLUDED.total_times, ipo_subscriptions.total_times)
      `;
      count++;
    } catch (err) {
      console.error(`    ❌ Subscription ${ipo.name}: ${err.message}`);
    }
  }

  console.log(`    ✅ Upserted ${count} subscription records`);
  return count;
}

export async function upsertSubscriptions(subscriptionData) {
  requireDb();
  const today = new Date().toISOString().slice(0, 10);
  let count = 0;

  for (const entry of subscriptionData) {
    const slug = entry.slug || slugify(entry.name);
    try {
      const rows = await sql`SELECT id FROM ipos WHERE slug = ${slug}`;
      if (rows.length === 0) {
        const fuzzy = await sql`
          SELECT id, slug, name FROM ipos
          WHERE LOWER(name) LIKE ${'%' + entry.name.toLowerCase().slice(0, 12) + '%'}
          LIMIT 1
        `;
        if (fuzzy.length === 0) continue;
        entry.ipoId = fuzzy[0].id;
      } else {
        entry.ipoId = rows[0].id;
      }

      await sql`
        INSERT INTO ipo_subscriptions (
          ipo_id, date, retail_times, nii_times, qib_times, total_times
        ) VALUES (
          ${entry.ipoId}, ${today},
          ${entry.retail ?? null}, ${entry.nii ?? null},
          ${entry.qib ?? null}, ${entry.subscription ?? entry.total ?? null}
        )
        ON CONFLICT (ipo_id, date) DO UPDATE SET
          retail_times = COALESCE(EXCLUDED.retail_times, ipo_subscriptions.retail_times),
          nii_times = COALESCE(EXCLUDED.nii_times, ipo_subscriptions.nii_times),
          qib_times = COALESCE(EXCLUDED.qib_times, ipo_subscriptions.qib_times),
          total_times = COALESCE(EXCLUDED.total_times, ipo_subscriptions.total_times)
      `;
      count++;
    } catch (err) {
      console.error(`    ❌ Subscription ${entry.name}: ${err.message}`);
    }
  }

  console.log(`    ✅ Upserted ${count} subscription records`);
  return count;
}

/** Merge NSE + BSE + SEBI lists, preferring NSE for live IPOs */
export function mergeAuthorizedIPOs(nseIPOs, bseIPOs, sebiFilings) {
  const map = new Map();

  for (const ipo of [...nseIPOs, ...bseIPOs]) {
    const key = ipo.slug || slugify(ipo.name);
    if (!map.has(key)) {
      map.set(key, { ...ipo, slug: key, highlights: [], risks: [], riskScore: 5 });
    } else {
      const existing = map.get(key);
      map.set(key, { ...existing, ...ipo, slug: key });
    }
  }

  for (const filing of sebiFilings) {
    const key = filing.slug;
    if (!map.has(key)) {
      map.set(key, {
        ...filing,
        highlights: [],
        risks: [],
        riskScore: 5,
        priceRange: '',
      });
    } else {
      const existing = map.get(key);
      map.set(key, { ...existing, drhpUrl: filing.drhpUrl || existing.drhpUrl });
    }
  }

  return Array.from(map.values());
}

// ─── Expense Ratio (AMFI TER) ────────────────────────────────

export async function upsertExpenseRatiosFromAMFI(terRecords, terMonth) {
  requireDb();
  const indexes = indexTerRecords(terRecords);

  const funds = await sql`
    SELECT id, name, slug, scheme_code, expense_ratio
    FROM funds
    WHERE is_active = true
  `;

  let updated = 0;
  let matched = 0;
  const matchedKeys = new Set();

  for (const fund of funds) {
    const ter = terForDbFund(fund, indexes);
    if (ter == null) continue;

    matched++;
    matchedKeys.add(`${normalizeTerSchemeName(fund.name)}|${fund.slug.endsWith('-direct-plan') ? 'd' : 'r'}`);

    const prev = fund.expense_ratio != null ? Number(fund.expense_ratio) : null;
    if (prev === ter) continue;

    await sql`
      UPDATE funds
      SET expense_ratio = ${ter}, updated_at = NOW()
      WHERE id = ${fund.id}
    `;
    updated++;
  }

  // Secondary pass: match AMFI rows not hit via fund.name (full TER scheme label)
  for (const row of terRecords) {
    const schemeName = String(row.Scheme_Name || '').trim();
    if (!schemeName) continue;

    const isDirect = /\bdirect\b/i.test(schemeName);
    const isRegular = /\bregular\b/i.test(schemeName);
    if (!isDirect && !isRegular) continue;

    const key = normalizeTerSchemeName(schemeName);
    const passKey = `${key}|${isDirect ? 'd' : 'r'}`;
    if (matchedKeys.has(passKey)) continue;

    const fund = [...funds].find((f) => {
      const fundKey = normalizeTerSchemeName(f.name);
      if (fundKey !== key) return false;
      return isDirect ? f.slug.endsWith('-direct-plan') : !f.slug.endsWith('-direct-plan');
    });
    if (!fund) continue;

    const ter = parseFloat(String(row.TER_total ?? row.TER ?? '').replace(/%/g, ''));
    if (!Number.isFinite(ter)) continue;

    matched++;
    matchedKeys.add(passKey);
    const rounded = Math.round(ter * 100) / 100;
    const prev = fund.expense_ratio != null ? Number(fund.expense_ratio) : null;
    if (prev === rounded) continue;

    await sql`
      UPDATE funds
      SET expense_ratio = ${rounded}, updated_at = NOW()
      WHERE id = ${fund.id}
    `;
    updated++;
  }

  const unmatched = terRecords.length - matched;
  return { updated, matched, unmatched: Math.max(0, unmatched), month: terMonth };
}
