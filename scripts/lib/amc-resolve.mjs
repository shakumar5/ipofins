/**
 * Canonical AMC names and fund-name → AMC resolution.
 * Used by seed-from-json, holdings parser, and DB fix scripts.
 */

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 80);
}

/** Ordered patterns — first match wins (more specific before generic). */
export const AMC_NAME_PATTERNS = [
  { pattern: /^(ICICI Prudential)\s/i, name: 'ICICI Prudential' },
  { pattern: /^(Aditya Birla Sun Life)\s/i, name: 'Aditya Birla Sun Life' },
  { pattern: /^(Mahindra Manulife)\s/i, name: 'Mahindra Manulife' },
  { pattern: /^(Motilal Oswal)\s/i, name: 'Motilal Oswal' },
  { pattern: /^(Franklin India|Franklin Build India|Franklin Asian)\s/i, name: 'Franklin India' },
  { pattern: /^(Templeton India)\s/i, name: 'Franklin India' },
  { pattern: /^(Invesco India)\s/i, name: 'Invesco India' },
  { pattern: /^(Nippon India)\s/i, name: 'Nippon India' },
  { pattern: /^(Canara Robeco)\s/i, name: 'Canara Robeco' },
  { pattern: /^(Bajaj Finserv)\s/i, name: 'Bajaj Finserv' },
  { pattern: /^(Bank of India)\s/i, name: 'Bank of India' },
  { pattern: /^(Baroda BNP)\s/i, name: 'Baroda BNP' },
  { pattern: /^(JM Financial|JM)\s/i, name: 'JM Financial' },
  { pattern: /^(Old Bridge)\s/i, name: 'Old Bridge' },
  { pattern: /^(JioBlackRock|Jio BlackRock)\s/i, name: 'Jio BlackRock' },
  { pattern: /^(Angel One)\s/i, name: 'Angel One' },
  { pattern: /^(WhiteOak Capital|White Oak)\s/i, name: 'WhiteOak Capital' },
  { pattern: /^(Parag Parikh|PPFAS)\s/i, name: 'Parag Parikh' },
  { pattern: /^(PGIM India)\s/i, name: 'PGIM India' },
  { pattern: /^(Mirae Asset)\s/i, name: 'Mirae Asset' },
  { pattern: /^(360 ONE)\s/i, name: '360 ONE' },
  { pattern: /^(TRUSTMF|Trust MF|Trust)\s/i, name: 'Trust' },
  { pattern: /^(HDFC)\s/i, name: 'HDFC' },
  { pattern: /^(SBI)\s/i, name: 'SBI' },
  { pattern: /^(Kotak)\s/i, name: 'Kotak' },
  { pattern: /^(Axis)\s/i, name: 'Axis' },
  { pattern: /^(Navi)\s/i, name: 'Navi' },
  { pattern: /^(Taurus)\s/i, name: 'Taurus' },
  { pattern: /^(Abakkus)\s/i, name: 'Abakkus' },
  { pattern: /^(Unifi)\s/i, name: 'Unifi' },
  { pattern: /^(DSP)\s/i, name: 'DSP' },
  { pattern: /^(Quant)\s/i, name: 'Quant' },
  { pattern: /^(Groww|IB\d+-Groww)\s/i, name: 'Groww' },
  { pattern: /^(PGIM India|PGIM)\s/i, name: 'PGIM India' },
  { pattern: /^(Capitalmind)\s/i, name: 'Capitalmind' },
  { pattern: /^(Choice)\s/i, name: 'Choice' },
  { pattern: /^(Shriram)\s/i, name: 'Shriram' },
  { pattern: /^(Edelweiss)\s/i, name: 'Edelweiss' },
  { pattern: /^(Helios)\s/i, name: 'Helios' },
  { pattern: /^(HSBC)\s/i, name: 'HSBC' },
  { pattern: /^(LIC)\s/i, name: 'LIC' },
  { pattern: /^(Bandhan)\s/i, name: 'Bandhan' },
  { pattern: /^(Sundaram)\s/i, name: 'Sundaram' },
  { pattern: /^(Shriram)\s/i, name: 'Shriram' },
  { pattern: /^(Samco)\s/i, name: 'Samco' },
  { pattern: /^(Union)\s/i, name: 'Union' },
  { pattern: /^(UTI)\s/i, name: 'UTI' },
  { pattern: /^(Tata)\s/i, name: 'Tata' },
  { pattern: /^(ITI)\s/i, name: 'ITI' },
  { pattern: /^(NJ)\s/i, name: 'NJ' },
  { pattern: /^(Choice)\s/i, name: 'Choice' },
];

/** All AMCs we track (including smaller / newer houses). */
export const CANONICAL_AMCS = [
  '360 ONE',
  'Abakkus',
  'Aditya Birla Sun Life',
  'Angel One',
  'Axis',
  'Bajaj Finserv',
  'Bandhan',
  'Bank of India',
  'Baroda BNP',
  'Canara Robeco',
  'Capitalmind',
  'Choice',
  'DSP',
  'Edelweiss',
  'Franklin India',
  'Groww',
  'HDFC',
  'Helios',
  'HSBC',
  'ICICI Prudential',
  'Invesco India',
  'ITI',
  'Jio BlackRock',
  'JM Financial',
  'Kotak',
  'LIC',
  'Mahindra Manulife',
  'Mirae Asset',
  'Motilal Oswal',
  'Navi',
  'Nippon India',
  'NJ',
  'Old Bridge',
  'Parag Parikh',
  'PGIM India',
  'Quant',
  'SBI',
  'Samco',
  'Shriram',
  'Sundaram',
  'Tata',
  'Taurus',
  'Trust',
  'Union',
  'Unifi',
  'UTI',
  'WhiteOak Capital',
  'Other',
];

/** Parser / disclosure label → canonical DB AMC name */
export const PARSER_AMC_TO_CANONICAL = {
  Invesco: 'Invesco India',
  'Trust MF': 'Trust',
  Jio: 'Jio BlackRock',
  'White Oak Capital': 'WhiteOak Capital',
  'Baroda BNP Paribas': 'Baroda BNP',
  'Franklin Templeton': 'Franklin India',
  PPFAS: 'Parag Parikh',
  'Parag Parikh Flexi Cap Fund': 'Parag Parikh',
};

export function extractAmcFromFundName(fundName) {
  for (const { pattern, name } of AMC_NAME_PATTERNS) {
    if (pattern.test(fundName)) return name;
  }
  return 'Other';
}

export function canonicalParserAmc(parserAmc) {
  return PARSER_AMC_TO_CANONICAL[parserAmc] || parserAmc;
}

export function inferCategoryFromFundName(name) {
  const n = name.toLowerCase();
  if (n.includes('elss') || n.includes('tax saver')) return 'ELSS';
  if (n.includes('large & mid') || n.includes('large and mid')) return 'Large & Mid Cap';
  if (n.includes('flexi cap')) return 'Flexi Cap';
  if (n.includes('multi cap') || n.includes('multicap')) return 'Multi Cap';
  if (n.includes('mid cap') || n.includes('midcap')) return 'Mid Cap';
  if (n.includes('small cap') || n.includes('smallcap')) return 'Small Cap';
  if (n.includes('large cap') || n.includes('largecap')) return 'Large Cap';
  if (n.includes('focused')) return 'Focused';
  if (n.includes('value')) return 'Value';
  if (n.includes('contra')) return 'Contra';
  if (n.includes('dividend yield')) return 'Dividend Yield';
  if (n.includes('hybrid') || n.includes('balanced')) return 'Hybrid';
  if (n.includes('sector') || n.includes('thematic') || n.includes('infrastructure') || n.includes('consumption') || n.includes('banking') || n.includes('technology') || n.includes('pharma') || n.includes('ethical')) return 'Sectoral/Thematic';
  return 'Flexi Cap';
}
