export type CalculatorSeoSlug =
  | 'emi-calculator'
  | 'cagr-calculator'
  | 'lumpsum-calculator'
  | 'ppf-calculator'
  | 'fd-calculator'
  | 'tax-calculator'
  | 'swp-calculator'
  | 'step-up-sip-calculator'
  | 'retirement-calculator'
  | 'rent-vs-buy-calculator'
  | 'nps-calculator'
  | 'ipo-profit-calculator'
  | 'return-simulator'
  | 'tax-saving-planner'
  | 'goal-planner';

const P = 'text-surface-600 dark:text-surface-300';
const H2 = 'text-xl font-bold text-surface-900 dark:text-white mb-4 mt-2';
const H3 = 'text-base font-semibold text-surface-800 dark:text-surface-200 mt-4 mb-2';
const LINK = 'text-primary-600 hover:underline';

function block(sections: string[]): string {
  return sections.join('\n');
}

const CONTENT: Record<CalculatorSeoSlug, string> = {
  'emi-calculator': block([
    `<h2 class="${H2}">Understanding EMI in India (2026)</h2>`,
    `<p class="${P}">Equated Monthly Installment (EMI) is the fixed amount you repay each month on a home loan, car loan, personal loan, or education loan. Indian lenders use a reducing-balance method: interest is charged on the outstanding principal, so early EMIs contain more interest and later EMIs contain more principal. RBI-regulated banks and NBFCs must disclose the annual percentage rate (APR) including processing fees — always compare APR, not just the headline interest rate.</p>`,
    `<p class="${P}">Home loan rates in 2026 typically range from 8.25% to 9.5% for salaried borrowers with CIBIL scores above 750. Car loans run 8.5–11% and personal loans 10–18% depending on credit profile. A ₹50 lakh home loan at 8.5% for 20 years produces an EMI of roughly ₹43,400 and total interest of about ₹54 lakhs — use this calculator to model your exact numbers before applying.</p>`,
    `<h3 class="${H3}">EMI formula explained</h3>`,
    `<p class="${P}">EMI = [P × R × (1+R)^N] / [(1+R)^N − 1], where P = principal, R = monthly interest rate (annual ÷ 12 ÷ 100), N = tenure in months. This is the same formula used by SBI, HDFC, ICICI, and other major lenders. Our calculator runs entirely in your browser — no data is stored or transmitted.</p>`,
    `<h3 class="${H3}">15-year vs 20-year vs 30-year tenure</h3>`,
    `<p class="${P}">Longer tenure lowers EMI but increases total interest dramatically. On a ₹50L loan at 8.5%: 15-year EMI ≈ ₹49,200 (total interest ₹38.5L), 20-year ≈ ₹43,400 (₹54.1L interest), 30-year ≈ ₹38,400 (₹88.2L interest). Financial planners recommend keeping total EMI obligations within 40–50% of net monthly income. If you expect salary growth, a 20-year loan with annual prepayments often beats a 30-year loan on total interest saved.</p>`,
    `<h3 class="${H3}">Prepayment and floating vs fixed rate</h3>`,
    `<p class="${P}">Most floating-rate home loans allow partial prepayment without penalty (RBI guidelines). You can choose to reduce tenure (saves more interest) or reduce EMI. Fixed-rate loans may carry prepayment charges — check your loan agreement. Pair this tool with our <a href="/tools/sip-calculator" class="${LINK}">SIP calculator</a> if you are balancing loan repayment with mutual fund investing.</p>`,
    `<h3 class="${H3}">Tax benefits on home loan EMI</h3>`,
    `<p class="${P}">Section 24(b) allows up to ₹2 lakh deduction on home loan interest for self-occupied property (old regime). Section 80C covers principal repayment up to ₹1.5 lakh. First-time buyers may claim additional ₹50,000 under Section 80EEA for affordable housing (conditions apply). Use our <a href="/tools/tax-calculator" class="${LINK}">income tax calculator</a> to see net benefit after deductions.</p>`,
  ]),
  'cagr-calculator': block([
    `<h2 class="${H2}">What is CAGR and why it matters</h2>`,
    `<p class="${P}">Compound Annual Growth Rate (CAGR) smooths volatile year-to-year returns into a single annualized figure. If your ₹1 lakh grew to ₹2.5 lakh in 5 years, CAGR = (2.5/1)^(1/5) − 1 ≈ 20.1%. This is the standard metric for comparing mutual funds, stocks, and portfolio performance across different time horizons — more meaningful than simple average returns.</p>`,
    `<p class="${P}">SEBI mandates that mutual funds display point-to-point and CAGR returns in factsheets. When evaluating funds on IPOFins, compare 3-year and 5-year CAGR within the same category (Large Cap vs Mid Cap) rather than across categories. Past CAGR does not guarantee future performance.</p>`,
    `<h3 class="${H3}">CAGR vs absolute return vs XIRR</h3>`,
    `<p class="${P}">Absolute return ignores time: +80% over 4 years sounds great but may be only 16% CAGR. XIRR handles irregular cash flows (SIPs, withdrawals) — use our <a href="/tools/sip-calculator" class="${LINK}">SIP calculator</a> for SIP projections and this CAGR tool for lumpsum or end-value comparisons. For mutual fund SIPs with monthly investments, XIRR is more accurate than CAGR on invested amount alone.</p>`,
    `<h3 class="${H3}">Benchmark CAGR expectations (India)</h3>`,
    `<p class="${P}">Historical 10-year CAGRs (indicative): Nifty 50 large-cap ~12–13%, Nifty Midcap 150 ~15–17%, small-cap indices higher but with deeper drawdowns. Fixed deposits deliver 6–7% pre-tax. PPF currently ~7.1% tax-free. Use these benchmarks to sanity-check your portfolio CAGR — if your equity CAGR is below FD returns over 7+ years, review fund selection on our <a href="/mutual-funds/best" class="${LINK}">best mutual funds</a> page.</p>`,
    `<h3 class="${H3}">How fund managers use CAGR</h3>`,
    `<p class="${P}">Rolling returns (e.g., 3-year CAGR calculated every month for the past 10 years) show consistency better than a single CAGR snapshot. A fund with 14% CAGR but high volatility may suit aggressive investors; a 11% CAGR with lower standard deviation may suit conservative portfolios. Check category rank and <a href="/mutual-funds/smart-money" class="${LINK}">Smart Money</a> institutional activity for additional context.</p>`,
  ]),
  'lumpsum-calculator': block([
    `<h2 class="${H2}">Lumpsum investing in mutual funds</h2>`,
    `<p class="${P}">A lumpsum investment deploys your entire capital at once into a mutual fund, stock, or other asset. Unlike SIP (monthly averaging), lumpsum performance depends heavily on entry timing — buying near market peaks can depress returns for years, while investing during corrections can amplify long-term CAGR.</p>`,
    `<p class="${P}">Research on Indian equity markets suggests lumpsum outperforms SIP when invested at or near market bottoms, while SIP wins during volatile sideways markets due to rupee cost averaging. Many investors use a hybrid: regular SIP plus lumpsum top-ups when Nifty 50 falls 10–15% from recent highs.</p>`,
    `<h3 class="${H3}">When to choose lumpsum over SIP</h3>`,
    `<p class="${P}">Ideal lumpsum scenarios: annual bonus deployment, inheritance, sale of property, or staggered STP (Systematic Transfer Plan) from debt to equity over 6–12 months. If you fear timing risk, park funds in a liquid fund and transfer via STP rather than investing all at once in equity.</p>`,
    `<h3 class="${H3}">Tax on lumpsum mutual fund gains</h3>`,
    `<p class="${P}">Equity funds: STCG (held &lt;1 year) taxed at 20%; LTCG (held &gt;1 year) at 12.5% above ₹1.25 lakh annual exemption. Debt funds: all gains taxed at slab rate regardless of holding period (post-April 2023 rules). Factor tax into your net return calculation — a 12% gross CAGR may be ~10.5% after LTCG on large gains.</p>`,
    `<h3 class="${H3}">Example projections</h3>`,
    `<p class="${P}">₹5 lakh at 12% CAGR for 10 years → ~₹15.5 lakh. ₹10 lakh at 12% for 15 years → ~₹54.7 lakh. ₹25 lakh at 12% for 20 years → ~₹2.4 crore. Adjust the expected return slider to model conservative (8%), moderate (12%), and aggressive (15%) scenarios. Compare with <a href="/tools/step-up-sip-calculator" class="${LINK}">step-up SIP</a> if you will add monthly contributions later.</p>`,
  ]),
  'ppf-calculator': block([
    `<h2 class="${H2}">Public Provident Fund (PPF) — complete guide</h2>`,
    `<p class="${P}">PPF is a government-backed long-term savings scheme with EEE tax status (exempt on investment, interest, and maturity). Current rate is set quarterly by the government (~7.1% as of 2026). Minimum annual deposit ₹500, maximum ₹1.5 lakh per financial year. Maturity is 15 years, extendable in 5-year blocks.</p>`,
    `<p class="${P}">PPF suits risk-averse investors building a tax-free retirement corpus. Interest is compounded annually. Partial withdrawals allowed from year 7; loans against PPF balance available from year 3. PPF contributions qualify for Section 80C deduction up to ₹1.5 lakh.</p>`,
    `<h3 class="${H3}">PPF vs ELSS vs NPS</h3>`,
    `<p class="${P}">ELSS mutual funds offer Section 80C benefit with 3-year lock-in and equity upside but market risk. NPS offers additional ₹50,000 deduction under 80CCD(1B) with market-linked returns. PPF offers certainty and zero market risk at lower returns. A balanced portfolio often combines PPF (debt anchor) with equity SIPs for growth.</p>`,
    `<h3 class="${H3}">Maximizing PPF corpus</h3>`,
    `<p class="${P}">Invest before the 5th of each month to earn interest for that month (historical rule — confirm with your bank/post office). Investing ₹1.5 lakh lump sum on April 1 vs monthly ₹12,500 yields slightly higher returns due to earlier compounding. Use this calculator to compare annual vs monthly contribution patterns over 15 and 25 year horizons.</p>`,
  ]),
  'fd-calculator': block([
    `<h2 class="${H2}">Fixed Deposit (FD) calculator — India 2026</h2>`,
    `<p class="${P}">Bank fixed deposits remain popular for capital preservation. Senior citizens typically earn 0.25–0.50% extra. Major banks (SBI, HDFC, ICICI) offer 6.5–7.5% on 1–3 year tenures as of 2026; small finance banks may offer higher rates with slightly higher risk — always check DICGC insurance coverage (up to ₹5 lakh per bank per depositor).</p>`,
    `<p class="${P}">FD interest can be cumulative (reinvested) or paid out monthly/quarterly. TDS applies if annual interest exceeds ₹40,000 (₹50,000 for seniors). Interest is taxed at your income slab rate — in the 30% bracket, a 7% FD yields ~4.9% post-tax.</p>`,
    `<h3 class="${H3}">FD vs debt mutual funds</h3>`,
    `<p class="${P}">Debt mutual funds offer indexation benefit on long-term gains (if held &gt;2 years in some categories — check current tax rules) and better liquidity. FDs suit definite short-term goals (1–3 years) where capital safety is paramount. For emergency funds, consider sweep-in FDs or liquid mutual funds.</p>`,
    `<h3 class="${H3}">Laddering strategy</h3>`,
    `<p class="${P}">Split capital across 1-year, 2-year, and 3-year FDs maturing in sequence to balance liquidity and rate-lock benefit. When each FD matures, reinvest at prevailing rates if you do not need the cash. This calculator helps project maturity values for each ladder rung.</p>`,
  ]),
  'tax-calculator': block([
    `<h2 class="${H2}">Income tax calculator — FY 2025-26 (AY 2026-27)</h2>`,
    `<p class="${P}">India offers two regimes: Old (with deductions under 80C, 80D, HRA, etc.) and New (lower slab rates, fewer deductions). Salaried employees must choose each year — our calculator lets you compare both side by side. Standard deduction for salaried: ₹75,000 in new regime (FY 2025-26 budget updates — verify latest Finance Act).</p>`,
    `<p class="${P}">Key slabs (new regime, illustrative): income up to ₹4 lakh nil, 5% on ₹4–8 lakh, 10% on ₹8–12 lakh, 15% on ₹12–16 lakh, 20% on ₹16–20 lakh, 30% above ₹24 lakh (rebate under 87A may zero out tax up to ₹12 lakh income). Old regime retains 5% up to ₹5 lakh, 20% up to ₹10 lakh, 30% above with full deduction eligibility.</p>`,
    `<h3 class="${H3}">Common deductions (old regime)</h3>`,
    `<p class="${P}">80C: ₹1.5L (PPF, ELSS, life insurance, home loan principal). 80D: health insurance premiums. HRA: rent paid in metro/non-metro. 80CCD(1B): additional NPS ₹50,000. Home loan interest: up to ₹2 lakh under 24(b). Use our <a href="/tools/tax-saving-planner" class="${LINK}">tax-saving planner</a> to optimize ELSS and PPF allocation before March 31.</p>`,
    `<h3 class="${H3}">Capital gains tax summary</h3>`,
    `<p class="${P}">Equity LTCG: 12.5% above ₹1.25L/year. Equity STCG: 20%. Debt MF gains: slab rate. Property LTCG: 12.5% without indexation (post-budget rules). Plan harvest of gains in low-income years to use exemptions efficiently.</p>`,
  ]),
  'swp-calculator': block([
    `<h2 class="${H2}">Systematic Withdrawal Plan (SWP) explained</h2>`,
    `<p class="${P}">SWP lets you withdraw a fixed amount monthly from a mutual fund while the remaining corpus continues to grow. Ideal for retirees converting a lumpsum into regular income. Unlike dividends (which depend on fund performance and are not guaranteed), SWP amount is chosen by you — the fund redeems units each month to meet the withdrawal.</p>`,
    `<p class="${P}">If withdrawals exceed returns, corpus depletes over time. At 12% expected return and ₹50,000/month SWP from ₹1 crore, corpus may last 15–20+ years depending on market sequence risk. Conservative retirees often assume 8–9% return for planning.</p>`,
    `<h3 class="${H3}">SWP vs annuity vs FD interest</h3>`,
    `<p class="${P}">Annuities offer guaranteed lifetime income but lower returns and less flexibility. FD interest is taxable and fixed. SWP from equity hybrid funds balances growth and income but carries market risk — consider moving to debt funds as corpus shrinks. Pair with <a href="/tools/retirement-calculator" class="${LINK}">retirement calculator</a> for holistic planning.</p>`,
    `<h3 class="${H3}">Tax efficiency of SWP</h3>`,
    `<p class="${P}">Each SWP redemption is a sale of units — only the gain portion is taxed, not the full withdrawal. This can be more tax-efficient than receiving interest from FDs where the entire amount is taxable. Equity funds: LTCG rules apply on gains for units held &gt;1 year.</p>`,
  ]),
  'step-up-sip-calculator': block([
    `<h2 class="${H2}">Step-up SIP — grow wealth with salary hikes</h2>`,
    `<p class="${P}">A step-up (top-up) SIP increases your monthly investment by a fixed percentage or amount each year — typically aligned with annual salary increments. A ₹10,000 SIP with 10% annual step-up for 20 years at 12% CAGR can produce roughly 40–50% more corpus than a flat ₹10,000 SIP, because you invest more during peak earning years when compounding has less time but larger principal works harder in later years.</p>`,
    `<p class="${P}">Most AMCs and platforms (Groww, Zerodha Coin, MF Central) support step-up SIP automation. Start conservative (5–10% annual increase) — over-committing early can strain cash flow during emergencies.</p>`,
    `<h3 class="${H3}">Step-up vs flat SIP example</h3>`,
    `<p class="${P}">Flat ₹15,000/month for 20 years at 12% → ~₹1.5 crore invested ₹36L. ₹10,000 starting with 10% yearly step-up → similar corpus with lower early burden. Use this calculator to find the step-up rate that matches your expected income growth curve.</p>`,
    `<h3 class="${H3}">Best funds for step-up SIP</h3>`,
    `<p class="${P}">Long-horizon equity funds (Flexi Cap, Mid Cap) suit step-up SIPs with 10+ year horizon. Review <a href="/mutual-funds/best" class="${LINK}">best funds</a> and prefer Direct-Growth plans. Combine with annual portfolio review and overlap check via our <a href="/mutual-funds/portfolio-overlap-checker" class="${LINK}">overlap tool</a>.</p>`,
  ]),
  'retirement-calculator': block([
    `<h2 class="${H2}">Retirement planning for Indians</h2>`,
    `<p class="${P}">Retirement corpus = annual expenses × years in retirement adjusted for inflation. If you need ₹6 lakh/year today and retire in 25 years at 6% inflation, you will need ~₹25.8 lakh/year in year-1 of retirement. Multiply by 25–30 (safe withdrawal heuristic) for target corpus — often ₹5–10 crore for urban middle-class lifestyles.</p>`,
    `<p class="${P}">EPF, PPF, NPS, and gratuity form the government/employer pillar; mutual fund SIPs form the voluntary wealth pillar. NPS offers market-linked returns with partial equity allocation (up to 75% until age 50) plus ₹50,000 extra 80CCD(1B) deduction.</p>`,
    `<h3 class="${H3}">The 4% rule in Indian context</h3>`,
    `<p class="${P}">The 4% withdrawal rule (US-origin) suggests withdrawing 4% of retirement corpus annually. In India, account for higher inflation (5–6%) and healthcare costs. Many planners use 3–3.5% safe withdrawal or combine SWP from hybrid funds with SCSS/senior FD income.</p>`,
    `<h3 class="${H3}">Action checklist by age</h3>`,
    `<p class="${P}">20s: start SIP even if small. 30s: increase SIP with income, buy term insurance. 40s: peak earning — maximize step-up SIP and NPS. 50s: shift 20–30% to debt/hybrid, review retirement gap. 60s: implement SWP, claim EPF/PPF maturity strategically across financial years for tax efficiency.</p>`,
  ]),
  'rent-vs-buy-calculator': block([
    `<h2 class="${H2}">Rent vs buy — a financial framework</h2>`,
    `<p class="${P}">Buying a home builds equity but ties up capital in down payment, EMIs, maintenance, property tax, and stamp duty (5–7% in many states). Renting keeps mobility and invests the down payment difference in equity mutual funds — historically 12%+ CAGR over 15+ years. The better choice depends on city, tenure of stay, rental yield, and loan rate.</p>`,
    `<p class="${P}">Rule of thumb: if annual rent is less than 3% of property price (e.g., ₹30k/month on ₹1.2 Cr = 3%), renting may be financially optimal in expensive metros. In tier-2 cities with 4–5% rental yield, buying often wins if you plan to stay 7+ years.</p>`,
    `<h3 class="${H3}">Hidden costs of home ownership</h3>`,
    `<p class="${P}">Include registration, GST on under-construction, society maintenance, renovation every 10–15 years, and opportunity cost of down payment. A ₹30 lakh down payment at 12% CAGR for 20 years grows to ~₹2.9 crore — factor this into buy-side math.</p>`,
    `<h3 class="${H3}">When buying makes emotional sense</h3>`,
    `<p class="${P}">Stability, school proximity, and freedom to renovate are non-financial benefits. If rent-vs-buy math is close, personal preference matters. Use our <a href="/tools/emi-calculator" class="${LINK}">EMI calculator</a> for loan scenarios after running this comparison.</p>`,
  ]),
  'nps-calculator': block([
    `<h2 class="${H2}">National Pension System (NPS) guide</h2>`,
    `<p class="${P}">NPS is a voluntary retirement scheme regulated by PFRDA. Tier I is locked until age 60 (partial withdrawal allowed for specific goals). You choose asset allocation between equity (E), corporate debt (C), government bonds (G), and alternative (A). Active choice allows up to 75% equity until age 50, tapering to 50% by 60.</p>`,
    `<p class="${P}">Tax benefits: employee contribution up to 10% of basic (80CCD(1)), employer contribution up to 10% (80CCD(2) — additional for salaried), and extra ₹50,000 under 80CCD(1B) beyond 80C limit. At maturity, 60% can be withdrawn tax-free (lump sum), 40% must buy annuity (taxable pension).</p>`,
    `<h3 class="${H3}">NPS vs mutual fund retirement corpus</h3>`,
    `<p class="${P}">NPS has lower fund management costs but mandatory annuity reduces flexibility. Equity mutual funds offer full liquidity and no forced annuity but lack exclusive 80CCD(1B) benefit. Many investors max 80CCD(1B) in NPS and build primary corpus via equity SIPs.</p>`,
    `<h3 class="${H3}">Choosing NPS fund manager</h3>`,
    `<p class="${P}">Compare 5-year returns of SBI, HDFC, ICICI Pru, UTI NPS schemes on CRA portal. Auto lifecycle funds reduce manual rebalancing. Review allocation annually as you approach 50.</p>`,
  ]),
  'ipo-profit-calculator': block([
    `<h2 class="${H2}">IPO profit and listing gain calculator</h2>`,
    `<p class="${P}">IPO investing in India requires applying within the retail quota (up to ₹2 lakh per issue per PAN). Profit depends on allotment (often partial or zero in oversubscribed issues), listing price vs issue price, and post-listing holding period. Grey market premium (GMP) indicates unofficial market expectation but is not guaranteed — track live GMP on our <a href="/ipo" class="${LINK}">IPO hub</a>.</p>`,
    `<p class="${P}">Tax: if listed and sold within 12 months, gains taxed as STCG at 20%. If held &gt;12 months after listing, LTCG at 12.5% above ₹1.25 lakh annual exemption. IPO shares are considered listed from listing day for holding period calculation.</p>`,
    `<h3 class="${H3}">Allotment probability factors</h3>`,
    `<p class="${P}">Highly oversubscribed retail quotas use lottery allotment — applying 1 lot vs max ₹2L often yields similar odds per rupee. SME IPOs may have better allotment odds but higher volatility. Check subscription status on IPO detail pages before bidding closes.</p>`,
    `<h3 class="${H3}">Should you sell on listing day?</h3>`,
    `<p class="${P}">Data shows mixed results — some IPOs fade after initial pop, others double over years. Use IPOFins score, sector outlook, and peer valuation (P/E vs listed competitors) before deciding. Never borrow to apply for IPOs.</p>`,
  ]),
  'return-simulator': block([
    `<h2 class="${H2}">Investment return simulator</h2>`,
    `<p class="${P}">This simulator models how an initial investment grows under different annual return assumptions and time horizons. Useful for goal-setting: education corpus, wedding fund, or down payment target. Adjust return slider to see best-case (15%), base-case (12%), and stress-case (8%) scenarios — critical for realistic planning.</p>`,
    `<p class="${P}">Sequence of returns risk matters: losing 20% in year 1 then gaining 20% does not break even. Simulators show geometric growth; real paths are jagged. For SIP-style contributions use <a href="/tools/sip-calculator" class="${LINK}">SIP calculator</a>; for one-time deployment use <a href="/tools/lumpsum-calculator" class="${LINK}">lumpsum calculator</a>.</p>`,
    `<h3 class="${H3}">Inflation adjustment</h3>`,
    `<p class="${P}">Nominal ₹1 crore in 20 years may buy what ₹35–40 lakh buys today at 6% inflation. Mentally discount simulated outputs by inflation for real purchasing power. Retirement planning should always use real (inflation-adjusted) return assumptions of 5–7% for equity-heavy portfolios.</p>`,
  ]),
  'tax-saving-planner': block([
    `<h2 class="${H2}">Tax-saving investment planner — Section 80C</h2>`,
    `<p class="${P}">Section 80C allows ₹1.5 lakh deduction from taxable income (old regime). Common instruments: ELSS mutual funds (3-year lock, equity returns), PPF (15-year, tax-free), EPF (salaried), life insurance premium, home loan principal, SSY, NSC, and 5-year tax-saving FD. ELSS typically offers best growth potential for young investors willing to accept market risk.</p>`,
    `<p class="${P}">In the 30% tax bracket, fully utilizing 80C saves ₹46,800 tax annually. Add NPS ₹50,000 under 80CCD(1B) for another ₹15,600 savings. Plan investments before March to avoid last-minute rushed decisions.</p>`,
    `<h3 class="${H3}">ELSS selection tips</h3>`,
    `<p class="${P}">Choose funds with consistent 5-year rolling returns, reasonable AUM, and low expense ratio (Direct plan). Browse category leaders on <a href="/mutual-funds/best" class="${LINK}">best funds</a>. Avoid insurance-linked products masquerading as 80C investments — high charges erode returns.</p>`,
    `<h3 class="${H3}">Old vs new regime decision</h3>`,
    `<p class="${P}">If your total deductions (80C + 80D + HRA + home loan interest) exceed ~₹3–4 lakh, old regime often wins for high earners. Use <a href="/tools/tax-calculator" class="${LINK}">tax calculator</a> with your actual salary structure before committing to ELSS or PPF solely for tax savings.</p>`,
  ]),
  'goal-planner': block([
    `<h2 class="${H2}">Financial goal planner</h2>`,
    `<p class="${P}">Goal-based investing assigns each objective a timeline, target amount, and asset allocation. Short-term goals (&lt;3 years): debt funds, FDs, liquid funds. Medium-term (3–7 years): hybrid or conservative allocation. Long-term (&gt;7 years): equity SIPs in appropriate categories (large cap for stability, mid/small for aggressive goals).</p>`,
    `<p class="${P}">Work backwards from target: if you need ₹50 lakh in 10 years and expect 12% returns, monthly SIP required ≈ ₹22,000. Increase SIP by 10% yearly (step-up) to reduce burden. Review goals annually — marriage, education, and retirement timelines shift.</p>`,
    `<h3 class="${H3}">Priority framework</h3>`,
    `<p class="${P}">1) Emergency fund (6 months expenses in liquid assets). 2) Term insurance + health cover. 3) High-interest debt payoff. 4) Retirement SIP (longest horizon). 5) Children education. 6) Discretionary goals (vacation, car). Never invest equity for goals within 3 years.</p>`,
    `<h3 class="${H3}">Tools to combine</h3>`,
    `<p class="${P}">Use <a href="/tools/sip-calculator" class="${LINK}">SIP</a>, <a href="/tools/goal-planner" class="${LINK}">goal planner</a>, and <a href="/mutual-funds/portfolio-overlap-checker" class="${LINK}">overlap checker</a> together when building a multi-fund portfolio for several goals.</p>`,
  ]),
};

export function getCalculatorSeoHtml(slug: CalculatorSeoSlug): string {
  return CONTENT[slug] ?? '';
}
