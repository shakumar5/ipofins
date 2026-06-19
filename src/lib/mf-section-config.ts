export type MfSectionTab =
  | 'best'
  | 'all'
  | 'holdings-changes'
  | 'overlap-checker'
  | 'fund-overlap';

export const MF_SECTION_TABS: {
  id: MfSectionTab;
  label: string;
  path: string;
  title: string;
  description: string;
  heading: string;
  subtitle: string;
}[] = [
  {
    id: 'best',
    label: 'Best Funds',
    path: '/mutual-funds/best',
    title: 'Best Mutual Funds India 2026 - Top Rated & Highest Returns | IPOFins',
    description:
      'List of best mutual funds in India 2026. Curated top-performing, 5-star rated funds across Large Cap, Mid Cap, Small Cap, ELSS. Direct-Growth plans only.',
    heading: 'Best Mutual Funds to Invest in 2026 - Top Rated Collection',
    subtitle: 'Top 5 by 3Y in each category, plus multi-criteria standouts (5-star • top 10 by 1Y)',
  },
  {
    id: 'all',
    label: 'All Funds',
    path: '/mutual-funds/all',
    title: 'List of All Mutual Funds in India 2026 - Compare Returns & NAV | IPOFins',
    description:
      'Complete list of all mutual funds in India 2026 with 1Y, 3Y, 5Y returns, NAV, and ratings. Compare Large Cap, Mid Cap, Small Cap, ELSS funds.',
    heading: 'List of All Mutual Funds in India 2026',
    subtitle: 'Equity Direct-Growth funds · Sort by returns · Portfolio data where available',
  },
  {
    id: 'holdings-changes',
    label: 'Holdings Changes',
    path: '/mutual-funds/mutual-fund-holdings-changes',
    title: 'Mutual Fund Holdings Changes 2026 - Track Additions & Removals | IPOFins',
    description:
      'Compare mutual fund portfolio holdings month-on-month. See which stocks top funds are buying and selling. Data from AMC monthly disclosures.',
    heading: 'Mutual Fund Holdings Changes',
    subtitle: 'Compare portfolio holdings between months. See what stocks top fund managers are buying and selling.',
  },
  {
    id: 'overlap-checker',
    label: 'Portfolio Overlap Checker',
    path: '/mutual-funds/portfolio-overlap-checker',
    title: 'Portfolio Overlap Checker - Compare Mutual Fund Holdings | IPOFins',
    description:
      'Check portfolio overlap between 2 to 4 mutual funds. See overlap percentage and common stock holdings to avoid duplicate exposure.',
    heading: 'Portfolio Overlap Checker',
    subtitle: 'Select 2–4 funds to see how much their portfolios overlap and which stocks they share.',
  },
  {
    id: 'fund-overlap',
    label: 'Fund Overlap',
    path: '/mutual-funds/fund-overlap',
    title: 'Fund Overlap 2026 - Pairwise Mutual Fund Portfolio Overlap | IPOFins',
    description:
      'Check how much two mutual funds overlap in stock holdings. Browse funds with portfolio data and compare pairwise overlap to avoid concentration risk.',
    heading: 'Fund Overlap',
    subtitle: 'Funds with portfolio holdings — select one to see overlap with other schemes that also have holdings data.',
  },
];

export function mfTabFromPath(pathname: string): MfSectionTab {
  if (pathname.startsWith('/mutual-funds/all')) return 'all';
  if (pathname.startsWith('/mutual-funds/mutual-fund-holdings-changes')) return 'holdings-changes';
  if (pathname.startsWith('/mutual-funds/portfolio-overlap-checker')) return 'overlap-checker';
  if (pathname === '/mutual-funds/fund-overlap') return 'fund-overlap';
  if (pathname.startsWith('/mutual-funds/best')) return 'best';
  return 'best';
}

export function mfTabConfig(tab: MfSectionTab) {
  return MF_SECTION_TABS.find((t) => t.id === tab) ?? MF_SECTION_TABS[0];
}
