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
  [/\bFLEXI\s*CAP\b/g, 'FLEXI CAP'],
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
  'axis-large-cap-fund': 'axis-bluechip-fund',
  'icici-prudential-large-cap-fund': 'icici-prudential-bluechip-fund',
  'franklin-india-large-cap-fund': 'franklin-india-bluechip-fund',
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

  const bySlug = new Map();
  const byAmcNorm = new Map();

  const sortedFunds = [...fundRows].sort((a, b) => {
    const score = (f) =>
      (f.slug.includes('direct-plan') ? 0 : 2) +
      (f.slug.includes('regular-plan') ? 0 : 1) +
      (f.slug.length > 40 ? 1 : 0);
    return score(a) - score(b);
  });

  for (const fund of sortedFunds) {
    bySlug.set(fund.slug, fund.id);
    for (const v of slugVariants(fund.slug)) bySlug.set(v, fund.id);

    const amcName = amcNameById[fund.amc_id] || '';
    const amcSlug = amcSlugById[fund.amc_id] || slugify(amcName);
    const norms = [
      normalizeFundName(fund.name, amcName),
      stripAmcPrefix(normalizeFundName(fund.name, amcName), amcName),
    ];
    for (const norm of norms) {
      byAmcNorm.set(`${amcSlug}|${slugify(norm)}`, fund.id);
      for (const v of slugVariants(slugify(norm))) {
        byAmcNorm.set(`${amcSlug}|${v}`, fund.id);
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
    if (bySlug.has(fundSlug)) return bySlug.get(fundSlug);

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

    for (const v of slugVariants(fundSlug)) {
      if (bySlug.has(v)) return bySlug.get(v);
    }

    return null;
  };
}
