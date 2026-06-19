import { canonicalParserAmc } from './amc-resolve.mjs';

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 80);
}

const AMC_PREFIXES = [
  'ADITYA BIRLA SUN LIFE',
  'ICICI PRUDENTIAL',
  'NIPPON INDIA',
  'MOTILAL OSWAL',
  'MAHINDRA MANULIFE',
  'FRANKLIN TEMPLETON',
  'FRANKLIN INDIA',
  'BARODA BNP PARIBAS',
  'BANK OF INDIA',
  'PGIM INDIA',
  'JM FINANCIAL',
  '360 ONE',
  'WHITEOAK CAPITAL',
  'WHITE OAK CAPITAL',
  'PARAG PARIKH',
  'BAJAJ FINSERV',
  'CANARA ROBECO',
  'MIRAE ASSET',
  'INVESCO INDIA',
  'DSP MUTUAL FUND',
  'DSP',
  'HDFC',
  'SBI',
  'KOTAK',
  'AXIS',
  'UTI',
  'TATA',
  'LIC',
  'GROWW',
  'QUANT',
  'BANDHAN',
  'EDELWEISS',
  'HSBC',
  'SUNDARAM',
  'UNION',
  'TRUST',
  'SAMCO',
  'HELIOS',
  'ITI',
  'SHRIRAM',
  'PPFAS',
  'NAVI',
  'TAURUS',
  'ABAKKUS',
  'OLD BRIDGE',
  'JIOBLACKROCK',
  'JIO BLACKROCK',
  'ANGEL ONE',
  'UNIFI',
  'CHOICE',
];

const WORD_REPLACEMENTS = [
  [/\bMIDCAP\b/g, 'MID CAP'],
  [/\bLARGECAP\b/g, 'LARGE CAP'],
  [/\bSMALLCAP\b/g, 'SMALL CAP'],
  [/\bMULTICAP\b/g, 'MULTI CAP'],
  [/\bFLEXICAP\b/g, 'FLEXI CAP'],
  [/\bFOCUSED\s+EQUITY\b/g, 'FOCUSED'],
  [/\bBANKING\s+AND\s+FINANCIAL/g, 'BANKING & FINANCIAL'],
  [/\bEXPORTS\s*&\s*SERVICES\b/g, 'EXPORTS & SERVICES'],
  [/\bEXPORTS\s+AND\s+SERVICES\b/g, 'EXPORTS & SERVICES'],
  [/\bLARGE\s+AND\s+MID\s*CAP\b/g, 'LARGE & MID CAP'],
  [/\bLARGE\s*&\s*MID\s*CAP\b/g, 'LARGE & MID CAP'],
  [/\bAND\b/g, '&'],
];

export function stripAmcPrefix(name, amcHint = '') {
  let s = String(name).toUpperCase().trim();
  const candidates = amcHint ? [amcHint.toUpperCase(), ...AMC_PREFIXES] : AMC_PREFIXES;
  for (const prefix of candidates) {
    const p = prefix.toUpperCase();
    if (s.startsWith(`${p} `)) {
      s = s.slice(p.length).trim();
      break;
    }
  }
  return s;
}

export function normalizeFundName(name, amcHint = '') {
  let s = String(name).toUpperCase().trim();
  s = s.replace(/\s*\(an open ended[^)]*\)/gi, '');
  s = s.replace(/\s*\(formerly[^)]*\)/gi, '');
  s = s.replace(/\s*\([^)]*\)\s*$/g, '');
  s = s.replace(/\s*\([^)]*$/g, '');
  s = s.replace(/\s*-\s*NO\.?\s*OF\s*SEGREGATED\s*PORTFOLIO.*/gi, '');
  s = s.replace(/\s*\(INVESTMENT\s*MANAGER[^)]*\)/gi, '');
  s = s.replace(/\s*\(LIVE\s*SCHEMES?\)/gi, '');
  s = s.replace(/\s*-\s*DIRECT\s*PLAN.*/gi, '');
  s = s.replace(/\s*-\s*REGULAR\s*PLAN.*/gi, '');
  s = s.replace(/\s*-\s*GROWTH.*/gi, '');
  s = s.replace(/\s*-\s*IDCW.*/gi, '');
  s = s.replace(/\s+MUTUAL\s+FUND(\s*\(.*\))?$/i, '');
  s = stripAmcPrefix(s, amcHint);
  for (const [pattern, replacement] of WORD_REPLACEMENTS) {
    s = s.replace(pattern, replacement);
  }
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Parser/Excel duplicate rows (no scheme code, mangled name). */
export function isMangledFund(fund) {
  const name = String(fund.name || '');
  const slug = String(fund.slug || '');
  if (fund.scheme_code) return false;
  if (slug.includes('direct-plan') || slug.includes('regular-plan')) return false;
  if (name.includes('(') && !name.includes(')')) return true;
  if (slug.length > 55) return true;
  if (/-large-cap-fund$|-small-cap-fund$|-multi-cap-fund$|-flexi-cap-fund$/.test(slug)) return true;
  return false;
}

/** Higher = preferred canonical fund for NAV + holdings. */
export function fundQualityScore(fund) {
  let score = 0;
  if (fund.scheme_code) score += 100;
  if (String(fund.slug || '').includes('direct-plan')) score += 50;
  if (String(fund.slug || '').includes('regular-plan')) score += 10;
  if (isMangledFund(fund)) score -= 80;
  score -= Math.min(String(fund.slug || '').length, 80) / 10;
  return score;
}

function putBetter(map, key, fundId, fundById) {
  const existing = map.get(key);
  if (existing == null) {
    map.set(key, fundId);
    return;
  }
  const cur = fundById.get(existing);
  const next = fundById.get(fundId);
  if (fundQualityScore(next) > fundQualityScore(cur)) map.set(key, fundId);
}

function slugVariants(slug) {
  const variants = new Set([slug]);
  const add = (s) => variants.add(s);
  add(slug.replace(/-midcap-/g, '-mid-cap-').replace(/-midcap$/g, '-mid-cap'));
  add(slug.replace(/-largecap-/g, '-large-cap-').replace(/-largecap$/g, '-large-cap'));
  add(slug.replace(/-smallcap-/g, '-small-cap-').replace(/-smallcap$/g, '-small-cap'));
  add(slug.replace(/-multicap-/g, '-multi-cap-').replace(/-multicap$/g, '-multi-cap'));
  add(slug.replace(/-flexicap-/g, '-flexi-cap-').replace(/-flexicap$/g, '-flexi-cap'));
  add(slug.replace(/-flexi-cap-/g, '-flexicap-').replace(/-flexi-cap$/g, '-flexicap'));
  add(slug.replace(/-and-/g, '-'));
  add(slug.replace(/-fund$/g, ''));
  return [...variants];
}

/** AMFI slug → holdings fund slug (renamed schemes). */
const AMFI_SLUG_ALIASES = {
  'sbi-large-cap-fund': 'sbi-bluechip-fund',
  'sbi-large-and-midcap-fund': 'sbi-large-midcap-fund',
  'sbi-flexicap-fund-direct-plan': 'sbi-flexi-cap-fund',
  'axis-large-cap-fund': 'axis-bluechip-fund',
  'icici-prudential-large-cap-fund': 'icici-prudential-bluechip-fund',
  'franklin-india-large-cap-fund': 'franklin-india-bluechip-fund',
  'canara-robeco-flexicap-fund-direct-plan': 'canara-robeco-flexi-cap-fund',
  'invesco-india-midcap-fund-direct-plan': 'invesco-india-mid-cap-fund',
  'invesco-india-largecap-fund-direct-plan': 'invesco-india-large-cap-fund',
  'invesco-india-smallcap-fund-direct-plan': 'invesco-india-small-cap-fund',
  'invesco-india-multicap-fund-direct-plan': 'invesco-india-multi-cap-fund',
  'invesco-india-large-and-mid-cap-fund': 'invesco-india-large-mid-cap-fund',
  'invesco-india-large-cap-fund': 'invesco-india-largecap-fund',
  'invesco-india-mid-cap-fund': 'invesco-india-midcap-fund',
  'invesco-india-small-cap-fund': 'invesco-india-smallcap-fund',
  'invesco-india-multi-cap-fund': 'invesco-india-multicap-fund',
  'icici-prudential-smallcap-fund-direct-plan': 'icici-prudential-small-cap-fund',
  'icici-prudential-flexicap-fund-direct-plan': 'icici-prudential-flexi-cap-fund',
  'icici-prudential-exports-services-fund-direct-plan': 'icici-prudential-exports-and-services-fund',
  'aditya-birla-sun-life-banking-and-financial-services-fund-direct-plan':
    'aditya-birla-sun-life-banking-financial-services-fund',
  'lic-mf-banking-and-financial-services-fund-direct-plan': 'lic-mf-banking-financial-services-fund',
  'ib01-groww-large-cap-fund': 'groww-largecap-fund-formerly-known-as-indiabulls-blue-chip-fund-direct-plan',
  'groww-large-cap-fund': 'groww-largecap-fund-formerly-known-as-indiabulls-blue-chip-fund-direct-plan',
  'ib11-groww-elss-tax-saver-fund': 'groww-elss-tax-saver-fund-direct-plan',
  'groww-elss-tax-saver-fund': 'groww-elss-tax-saver-fund-direct-plan',
  'ib13-groww-value-fund': 'groww-value-fund-formerly-known-as-indiabulls-value-fund-direct-plan',
  'groww-value-fund': 'groww-value-fund-formerly-known-as-indiabulls-value-fund-direct-plan',
  'ib19-groww-banking-financial-services-fund': 'groww-banking-and-financial-services-fund-direct-plan',
  'groww-banking-financial-services-fund': 'groww-banking-and-financial-services-fund-direct-plan',
  'ib29-groww-multicap-fund': 'groww-multicap-fund-direct-plan',
  'groww-multicap-fund': 'groww-multicap-fund-direct-plan',
  'ib60-groww-small-cap-fund': 'groww-small-cap-fund-direct-plan',
  'groww-small-cap-fund': 'groww-small-cap-fund-direct-plan',
  'mirae-asset-large-midcap-fund': 'mirae-asset-large-midcap-fund-direct-plan',
  'mirae-asset-flexi-cap-fund': 'mirae-asset-flexi-cap-fund-direct-plan',
  'mirae-asset-midcap-fund': 'mirae-asset-mid-cap-fund-direct-plan',
  'mirae-asset-small-cap-fund': 'mirae-asset-small-cap-fund-direct-plan',
  'mirae-asset-elss-tax-saver-fund': 'mirae-asset-elss-tax-saver-fund-direct-plan',
  'mirae-asset-focused-fund': 'mirae-asset-focused-fund-direct-plan',
  'mirae-asset-large-cap-fund': 'mirae-asset-large-cap-fund-direct-plan',
  'quant-flexi-cap-fund': 'quant-flexi-cap-fund-growth-option-direct-plan',
  'quant-large-cap-fund': 'quant-large-cap-fund-growth-option-direct-plan',
  'quant-mid-cap-fund': 'quant-mid-cap-fund-growth-option-direct-plan',
  'quant-small-cap-fund': 'quant-small-cap-fund-growth-option-direct-plan',
  'quant-elss-tax-saver-fund': 'quant-elss-tax-saver-fund-growth-option-direct-plan',
  'quant-focused-fund': 'quant-focused-fund-growth-option-direct-plan',
  'quant-large-mid-cap-fund': 'quant-large-mid-cap-fund-growth-option-direct-plan',
  'quant-multi-cap-fund': 'quant-multi-cap-fund-growth-option-direct-plan',
  'quant-value-fund': 'quant-value-fund-growth-option-direct-plan',
  'tata-flexi-cap-fund': 'tata-flexi-cap-fund-direct-plan',
  'tata-large-cap-fund': 'tata-large-cap-fund-direct-plan',
  'tata-mid-cap-fund': 'tata-mid-cap-fund-direct-plan',
  'tata-small-cap-fund': 'tata-small-cap-fund-direct-plan',
  'tata-elss-fund': 'tata-elss-fund-growth-direct-plan',
  'tata-focused-fund': 'tata-focused-fund-direct-plan',
  'tata-large-mid-cap-fund': 'tata-large-mid-cap-fund-direct-plan',
  'tata-multi-cap-fund': 'tata-multi-cap-fund-direct-plan',
  'iti-focused-equity-fund': 'iti-focused-fund-direct-plan',
  'iti-large-mid-cap-fund': 'iti-large-midcap-fund-direct-plan',
  'iti-mid-cap-fund': 'iti-mid-cap-fund-direct-plan',
  'kotak-infrastructure-and-economic-reform-fund': 'kotak-infrastructure-economic-reform-fund-direct-plan',
  'kotak-flexicap-fund': 'kotak-flexi-cap-fund-direct-plan',
  'kotak-contra-fund': 'kotak-contra-fund-direct-plan',
  'kotak-multicap-fund': 'kotak-multicap-fund-direct-plan',
  'kotak-focused-fund': 'kotak-focused-fund-direct-plan',
  'kotak-midcap-fund': 'kotak-midcap-fund-direct-plan',
  'kotak-quant-fund': 'kotak-quant-fund-direct-plan',
  'kotak-active-momentum-fund': 'kotak-active-momentum-fund-direct-plan',
  'kotak-banking-and-financial-services-fund': 'kotak-banking-financial-services-fund-direct-plan',
  'kotak-business-cycle-fund': 'kotak-business-cycle-direct-plan',
  'kotak-consumption-fund': 'kotak-consumption-fund-direct-plan',
  'kotak-esg-exclusionary-strategy-fund': 'kotak-esg-exclusionary-strategy-fund-direct-plan',
  'kotak-healthcare-fund': 'kotak-healthcare-fund-direct-plan',
  'kotak-mnc-fund': 'kotak-mnc-fund-direct-plan',
  'kotak-pioneer-fund': 'kotak-pioneer-fund-direct-plan',
  'kotak-rural-opportunities-fund': 'kotak-rural-opportunities-fund-direct-plan',
  'kotak-special-opportunities-fund': 'kotak-special-opportunities-fund-direct-plan',
  'kotak-technology-fund': 'kotak-technology-fund-direct-plan',
  'kotak-large-midcap-fund': 'kotak-large-midcap-fund-direct-plan',
  'bandhan-midcap-fund': 'bandhan-midcap-fund-direct-plan',
  'bandhan-multicap-fund': 'bandhan-multicap-fund-direct-plan',
  'bandhan-small-cap-fund': 'bandhan-small-cap-fund-direct-plan',
  'bandhan-multi-cap-fund': 'bandhan-multi-cap-fund-direct-plan',
  'hdfc-flexi-cap-fund': 'hdfc-flexi-cap-fund-growth-option-direct-plan',
  'hdfc-large-cap-fund': 'hdfc-large-cap-fund-growth-option-direct-plan',
  'hdfc-mid-cap-fund': 'hdfc-mid-cap-fund-growth-option-direct-plan',
  'hdfc-small-cap-fund': 'hdfc-small-cap-fund-growth-option-direct-plan',
  'hdfc-focused-fund': 'hdfc-focused-fund-growth-option-direct-plan',
  'hdfc-large-and-mid-cap-fund': 'hdfc-large-and-mid-cap-fund-growth-option-direct-plan',
  'hdfc-multi-cap-fund': 'hdfc-multi-cap-fund-growth-option-direct-plan',
  'hdfc-value-fund': 'hdfc-value-fund-growth-option-direct-plan',
  'hdfc-elss-tax-saver': 'hdfc-elss-tax-saver-growth-option-direct-plan',
  'canara-robeco-elss-tax-saver': 'canara-robeco-elss-tax-saver-direct-plan',
  'canara-robeco-focused-fund': 'canara-robeco-focused-fund-direct-plan',
  'union-largecap-fund': 'union-largecap-fund-direct-plan',
  'union-large-midcap-fund': 'union-large-midcap-fund-direct-plan',
  'sundaram-large-cap-fund': 'sundaram-large-cap-fund-formerly-known-as-sundaram-blue-chip-fund-direct-plan',
  'sundaram-large-and-mid-cap-fund': 'sundaram-large-and-midcap-fund-direct-plan',
  'parag-parikh-flexi-cap-fund':
    'parag-parikh-flexi-cap-fund-an-open-ended-dynamic-equity-scheme-investing-across',
  'nippon-india-flexi-cap-fund':
    'nippon-india-flexi-cap-fund-an-open-ended-dynamic-equity-scheme-investing-across',
};

/**
 * @param {{ id: number, slug: string, name: string, amc_id: number }[]} fundRows
 * @param {{ id: number, name: string, slug: string }[]} amcRows
 */
export function buildFundMatcher(fundRows, amcRows) {
  const amcNameById = Object.fromEntries(amcRows.map((a) => [a.id, a.name]));
  const amcSlugById = Object.fromEntries(amcRows.map((a) => [a.id, a.slug]));
  const fundById = new Map(fundRows.map((f) => [f.id, f]));

  const bySlug = new Map();
  const byAmcNorm = new Map();

  const sortedFunds = [...fundRows].sort(
    (a, b) => fundQualityScore(a) - fundQualityScore(b)
  );

  for (const fund of sortedFunds) {
    putBetter(bySlug, fund.slug, fund.id, fundById);
    for (const v of slugVariants(fund.slug)) putBetter(bySlug, v, fund.id, fundById);

    // Map legacy disclosure slugs (e.g. bandhan-large-cap-fund) → Direct Plan master row
    if (String(fund.slug).includes('-direct-plan')) {
      const base = fund.slug
        .replace(/(-direct-plan|-regular-plan)(-growth(-plan)?|-growth-option)?$/, '')
        .replace(/-growth-option$/, '')
        .replace(/-growth-plan$/, '')
        .replace(/-growth$/, '');
      putBetter(bySlug, base, fund.id, fundById);
      for (const v of slugVariants(base)) putBetter(bySlug, v, fund.id, fundById);
    }

    const amcName = amcNameById[fund.amc_id] || '';
    const amcSlug = amcSlugById[fund.amc_id] || slugify(amcName);
    const norms = [
      normalizeFundName(fund.name, amcName),
      stripAmcPrefix(normalizeFundName(fund.name, amcName), amcName),
    ];
    for (const norm of norms) {
      putBetter(byAmcNorm, `${amcSlug}|${slugify(norm)}`, fund.id, fundById);
      for (const v of slugVariants(slugify(norm))) {
        putBetter(byAmcNorm, `${amcSlug}|${v}`, fund.id, fundById);
      }
    }
  }

  for (const [amfiSlug, holdingsSlug] of Object.entries(AMFI_SLUG_ALIASES)) {
    if (bySlug.has(holdingsSlug)) bySlug.set(amfiSlug, bySlug.get(holdingsSlug));
  }

  const parserAmcToSlug = {
    'Aditya Birla Sun Life': 'aditya-birla-sun-life',
    'ICICI Prudential': 'icici-prudential',
    HDFC: 'hdfc',
    SBI: 'sbi',
    Kotak: 'kotak',
    Axis: 'axis',
    'Nippon India': 'nippon-india',
    DSP: 'dsp',
    'Mirae Asset': 'mirae-asset',
    'Motilal Oswal': 'motilal-oswal',
    'Invesco India': 'invesco-india',
    Invesco: 'invesco-india',
    'Canara Robeco': 'canara-robeco',
    Bandhan: 'bandhan',
    'Bajaj Finserv': 'bajaj-finserv',
    UTI: 'uti',
    Tata: 'tata',
    PPFAS: 'parag-parikh',
    'Parag Parikh': 'parag-parikh',
    Edelweiss: 'edelweiss',
    HSBC: 'hsbc',
    'Baroda BNP Paribas': 'baroda-bnp',
    'Baroda BNP': 'baroda-bnp',
    'Franklin Templeton': 'franklin-india',
    'Franklin India': 'franklin-india',
    Quant: 'quant',
    'Mahindra Manulife': 'mahindra-manulife',
    '360 ONE': '360-one',
    'JM Financial': 'jm-financial',
    LIC: 'lic',
    Groww: 'groww',
    Sundaram: 'sundaram',
    'PGIM India': 'pgim-india',
    'Bank of India': 'bank-of-india',
    ITI: 'iti',
    Shriram: 'shriram',
    Helios: 'helios',
    'WhiteOak Capital': 'whiteoak-capital',
    'White Oak Capital': 'whiteoak-capital',
    Union: 'union',
    Trust: 'trust',
    'Trust MF': 'trust',
    Samco: 'samco',
    NJ: 'nj',
    Navi: 'navi',
    Taurus: 'taurus',
    Abakkus: 'abakkus',
    'Old Bridge': 'old-bridge',
    Jio: 'jio-blackrock',
    'Jio BlackRock': 'jio-blackrock',
    'Angel One': 'angel-one',
    Unifi: 'unifi',
    Choice: 'choice',
    Capitalmind: 'capitalmind',
  };

  return function resolveFundId(fundSlug, fundData) {
    const amcSlug =
      parserAmcToSlug[canonicalParserAmc(fundData.amc)] ||
      parserAmcToSlug[fundData.amc] ||
      slugify(fundData.amc);
    const norms = [
      normalizeFundName(fundData.name, fundData.amc),
      stripAmcPrefix(fundData.name, fundData.amc),
    ];

    for (const norm of norms) {
      const key = `${amcSlug}|${slugify(norm)}`;
      if (byAmcNorm.has(key)) return byAmcNorm.get(key);
      for (const v of slugVariants(slugify(norm))) {
        const id = byAmcNorm.get(`${amcSlug}|${v}`);
        if (id) return id;
      }
    }

    if (bySlug.has(fundSlug)) return bySlug.get(fundSlug);

    for (const v of slugVariants(fundSlug)) {
      if (bySlug.has(v)) return bySlug.get(v);
    }

    return null;
  };
}
