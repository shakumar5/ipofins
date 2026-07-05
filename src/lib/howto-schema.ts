export interface HowToStep {
  name: string;
  text: string;
}

export interface HowToSchemaOpts {
  name: string;
  description: string;
  steps: HowToStep[];
  totalTime?: string;
}

/** HowTo JSON-LD for calculator and tool pages. */
export function buildHowToSchema({ name, description, steps, totalTime = 'PT2M' }: HowToSchemaOpts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    totalTime,
    step: steps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

const PRESETS: Record<string, HowToSchemaOpts> = {
  'sip-calculator': {
    name: 'How to Calculate SIP Returns',
    description: 'Calculate how much your monthly SIP investment will grow using compound interest',
    steps: [
      { name: 'Enter your monthly SIP amount', text: 'Enter how much you plan to invest every month (e.g., ₹5,000).' },
      { name: 'Set expected annual return rate', text: 'Enter the expected annual return. Historical Nifty 50 CAGR is around 12–14%.' },
      { name: 'Choose investment duration', text: 'Enter the number of years you plan to invest.' },
      { name: 'View your projected corpus', text: 'The calculator shows total investment, estimated returns, and final corpus.' },
    ],
  },
  'emi-calculator': {
    name: 'How to Calculate Loan EMI',
    description: 'Calculate monthly EMI for home, car, or personal loans in India',
    steps: [
      { name: 'Enter loan amount', text: 'Enter the principal loan amount (e.g., ₹25,00,000 for a home loan).' },
      { name: 'Set interest rate', text: 'Enter the annual interest rate offered by your lender (e.g., 8.5%).' },
      { name: 'Choose loan tenure', text: 'Select repayment period in years (e.g., 20 years).' },
      { name: 'Review EMI breakdown', text: 'See monthly EMI, total interest, and principal vs interest split.' },
    ],
  },
  'cagr-calculator': {
    name: 'How to Calculate CAGR',
    description: 'Find compound annual growth rate between two investment values',
    steps: [
      { name: 'Enter initial investment value', text: 'Enter the starting value of your investment.' },
      { name: 'Enter final value', text: 'Enter the current or ending value of the investment.' },
      { name: 'Set time period in years', text: 'Enter how many years the investment was held.' },
      { name: 'View CAGR percentage', text: 'The calculator shows annualized growth rate and absolute gain.' },
    ],
  },
  'lumpsum-calculator': {
    name: 'How to Calculate Lumpsum Returns',
    description: 'Estimate future value of a one-time mutual fund investment',
    steps: [
      { name: 'Enter investment amount', text: 'Enter the one-time lumpsum amount (e.g., ₹1,00,000).' },
      { name: 'Set expected return', text: 'Enter expected annual return based on fund category.' },
      { name: 'Choose investment period', text: 'Enter number of years you plan to stay invested.' },
      { name: 'View maturity value', text: 'See estimated corpus and wealth gain.' },
    ],
  },
  'swp-calculator': {
    name: 'How to Plan Systematic Withdrawals',
    description: 'Plan SWP from mutual fund corpus and see remaining balance',
    steps: [
      { name: 'Enter corpus amount', text: 'Enter total mutual fund value available for withdrawal.' },
      { name: 'Set monthly withdrawal', text: 'Enter how much you want to withdraw each month.' },
      { name: 'Set expected return', text: 'Enter expected annual return on remaining corpus.' },
      { name: 'Review sustainability', text: 'See how long corpus lasts and remaining balance over time.' },
    ],
  },
  'step-up-sip-calculator': {
    name: 'How to Calculate Step-Up SIP',
    description: 'Model SIP with annual increment in monthly contribution',
    steps: [
      { name: 'Enter starting SIP', text: 'Enter initial monthly SIP amount.' },
      { name: 'Set annual step-up', text: 'Enter percentage increase in SIP each year (e.g., 10%).' },
      { name: 'Set return and tenure', text: 'Enter expected return and total investment years.' },
      { name: 'Compare with flat SIP', text: 'View corpus difference vs a regular flat SIP.' },
    ],
  },
  'return-simulator': {
    name: 'How to Simulate Investment Returns',
    description: 'Compare returns across asset classes and time horizons',
    steps: [
      { name: 'Choose asset class', text: 'Select equity, debt, gold, or hybrid benchmark.' },
      { name: 'Enter investment amount', text: 'Enter lumpsum or monthly amount to simulate.' },
      { name: 'Set time horizon', text: 'Pick investment duration in years.' },
      { name: 'Compare scenarios', text: 'Review projected values under different return assumptions.' },
    ],
  },
  'fd-calculator': {
    name: 'How to Calculate Fixed Deposit Maturity Amount',
    description: 'Calculate FD maturity based on principal, rate, and compounding',
    steps: [
      { name: 'Enter deposit amount', text: 'Enter principal amount (e.g., ₹1,00,000).' },
      { name: 'Enter interest rate', text: 'Enter annual FD rate (typically 6.5–8% in 2026).' },
      { name: 'Set tenure and compounding', text: 'Enter years and compounding frequency (quarterly vs annual).' },
      { name: 'View maturity amount', text: 'See total maturity value and interest earned.' },
    ],
  },
  'ppf-calculator': {
    name: 'How to Calculate PPF Maturity',
    description: 'Estimate Public Provident Fund corpus with annual contributions',
    steps: [
      { name: 'Enter annual contribution', text: 'Enter yearly PPF deposit (max ₹1.5 lakh under 80C).' },
      { name: 'Set current PPF rate', text: 'Enter applicable PPF interest rate for the year.' },
      { name: 'Choose tenure', text: 'PPF has 15-year lock-in; extend in 5-year blocks if needed.' },
      { name: 'View maturity corpus', text: 'See estimated maturity value and total interest.' },
    ],
  },
  'nps-calculator': {
    name: 'How to Estimate NPS Corpus at Retirement',
    description: 'Project National Pension System corpus from monthly contributions',
    steps: [
      { name: 'Enter monthly contribution', text: 'Enter NPS Tier I monthly investment.' },
      { name: 'Enter current age', text: 'Enter your age today.' },
      { name: 'Set retirement age', text: 'Enter planned retirement age (typically 60).' },
      { name: 'View projected corpus', text: 'See estimated NPS balance at retirement.' },
    ],
  },
  'retirement-calculator': {
    name: 'How to Plan Retirement Corpus',
    description: 'Calculate inflation-adjusted retirement goal and required SIP',
    steps: [
      { name: 'Enter monthly expenses today', text: 'Enter current monthly living expenses.' },
      { name: 'Set retirement age and life expectancy', text: 'Enter when you plan to retire and expected lifespan.' },
      { name: 'Set inflation and return assumptions', text: 'Use realistic inflation (6%) and post-retirement return (7%).' },
      { name: 'View required corpus and SIP', text: 'See target corpus and monthly SIP needed to reach it.' },
    ],
  },
  'tax-calculator': {
    name: 'How to Calculate Capital Gains Tax',
    description: 'Compute STCG and LTCG tax on stocks, equity MF, debt, and gold',
    steps: [
      { name: 'Select asset type', text: 'Choose equity, debt mutual fund, gold, or property.' },
      { name: 'Enter purchase and sale values', text: 'Enter buy price, sell price, and holding period.' },
      { name: 'Apply indexation if applicable', text: 'For debt/gold LTCG, indexation may reduce taxable gain.' },
      { name: 'View tax liability', text: 'See STCG/LTCG tax as per current Indian tax rules.' },
    ],
  },
  'tax-saving-planner': {
    name: 'How to Plan Tax Savings',
    description: 'Optimize deductions under Old Regime with HRA, 80C, 80D, NPS',
    steps: [
      { name: 'Enter gross salary', text: 'Enter annual CTC or gross taxable income.' },
      { name: 'Add HRA and 80C investments', text: 'Enter rent paid, ELSS/PPF/EPF under 80C, and health insurance.' },
      { name: 'Add NPS and other deductions', text: 'Include 80CCD(1B) and other applicable deductions.' },
      { name: 'Compare tax before vs after', text: 'See tax saved and effective tax rate after optimisation.' },
    ],
  },
  'goal-planner': {
    name: 'How to Plan a Financial Goal',
    description: 'Calculate inflation-adjusted target and monthly SIP needed',
    steps: [
      { name: 'Enter goal amount today', text: 'Enter how much the goal costs today (e.g., ₹20 lakh for education).' },
      { name: 'Set years to goal', text: 'Enter when you need the money.' },
      { name: 'Set inflation and return', text: 'Use realistic inflation (6–7%) and expected investment return.' },
      { name: 'View target and monthly SIP', text: 'See future cost and monthly SIP or lumpsum required.' },
    ],
  },
  'rent-vs-buy-calculator': {
    name: 'How to Compare Rent vs Buy',
    description: 'Financial comparison of renting vs buying a home in India',
    steps: [
      { name: 'Enter property price and down payment', text: 'Enter home value and loan down payment percentage.' },
      { name: 'Set rent, loan rate, and tenure', text: 'Enter monthly rent, home loan rate, and EMI tenure.' },
      { name: 'Set appreciation and investment return', text: 'Enter expected property appreciation and alternate investment return.' },
      { name: 'Compare net worth over time', text: 'See which option builds more wealth over your chosen horizon.' },
    ],
  },
  'ipo-profit-calculator': {
    name: 'How to Calculate IPO Listing Profit',
    description: 'Estimate profit or loss on IPO application based on GMP or listing price',
    steps: [
      { name: 'Enter lot size and price band', text: 'Enter IPO lot size and application price (upper band).' },
      { name: 'Enter expected listing price or GMP', text: 'Use grey market premium or expected listing price.' },
      { name: 'Set number of lots applied', text: 'Enter how many lots you applied for in retail category.' },
      { name: 'View estimated profit', text: 'See gross listing gain and return on capital deployed.' },
    ],
  },
  'mf-xray': {
    name: 'How to Analyze MF Portfolio Exposure',
    description: 'See underlying stock and sector exposure across mutual funds',
    steps: [
      { name: 'Add your mutual funds', text: 'Search and select funds in your portfolio.' },
      { name: 'Enter investment value per fund', text: 'Enter current value invested in each fund.' },
      { name: 'Run portfolio X-Ray', text: 'Click Analyze to aggregate underlying holdings.' },
      { name: 'Review concentration and overlap', text: 'Check top stocks, sector weights, and fund overlap matrix.' },
    ],
  },
};

/** HowTo schema for a tool slug; returns null if slug unknown. */
export function howToForSlug(slug: string) {
  const preset = PRESETS[slug];
  if (!preset) return null;
  return buildHowToSchema(preset);
}

export function sipCalculatorHowTo() {
  return buildHowToSchema(PRESETS['sip-calculator']);
}
