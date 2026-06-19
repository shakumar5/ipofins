# Missing Holdings Checklist (All Funds tab)

Generated from live DB audit. **366** listable Direct-Growth equity funds · **312** linked · **54** missing.

Place new Excel files under `C:\Users\shaik\Downloads\Holdings\` (any subfolder). After adding files, run:

```bash
cd finverseui
npm run pipeline:monthly
```

---

## 1. Add entire AMC portfolio disclosure (7 funds)

No May 2026 portfolio data exists for these AMCs in the DB. Download **full monthly portfolio disclosure** (all equity schemes) from the AMC website.

### Samco (7 funds)

| # | Fund name | Scheme code | Category |
|---|-----------|-------------|----------|
| 1 | Samco ELSS Tax Saver Fund - Direct Plan | 150838 | ELSS |
| 2 | Samco Flexi Cap Fund - Direct Plan | 149450 | Flexi Cap |
| 3 | Samco Large Cap Fund - Direct Plan | 153239 | Large Cap |
| 4 | Samco Large & Mid Cap Fund - Direct Plan | 153534 | Mid Cap |
| 5 | Samco Multi Cap Fund - Direct Plan | 152847 | Multi Cap |
| 6 | Samco Active Momentum Fund - Direct Plan | 151753 | Sectoral |
| 7 | Samco Special Opportunities Fund - Direct Plan | 152586 | Sectoral |

---

## 2. Add per-scheme Excel files (33 funds)

AMC has some holdings in DB but **this scheme** was not parsed. Add the May 2026 portfolio Excel for each fund below.

### Bandhan (6)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | BANDHAN ELSS Tax Saver Fund - Direct Plan | ELSS | 118473 |
| 2 | Bandhan Focused Fund - Direct Plan | Focused | 118421 |
| 3 | BANDHAN FINANCIAL SERVICES FUND - DIRECT PLAN | Sectoral | 151816 |
| 4 | BANDHAN Infrastructure Fund-Direct Plan | Sectoral | 118469 |
| 5 | Bandhan Business Cycle Fund - Direct Plan | Sectoral | 152878 |
| 6 | Bandhan Healthcare Fund - Direct Plan | Sectoral | 153972 |

### Invesco India (5)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | Invesco India Business Cycle Fund - Direct Plan | Sectoral | 153291 |
| 2 | Invesco India Consumption Fund - Direct Plan | Sectoral | 153900 |
| 3 | Invesco India ESG Integration Strategy Fund - Direct Plan | Sectoral | 148751 |
| 4 | Invesco India Financial Services Fund - Direct Plan | Sectoral | 120385 |
| 5 | Invesco India Manufacturing Fund - Direct Plan | Sectoral | 152756 |

### Canara Robeco (4)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | CANARA ROBECO CONSUMPTION FUND - DIRECT PLAN | Sectoral | 118273 |
| 2 | CANARA ROBECO INFRASTRUCTURE FUND - DIRECT PLAN | Sectoral | 118267 |
| 3 | Canara Robeco Banking and Financials Services Fund - Direct Plan | Sectoral | 154250 |
| 4 | Canara Robeco Manufacturing Fund - Direct Plan | Sectoral | 152450 |

### Mirae Asset (3)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | Mirae Asset ELSS Tax Saver Fund - Direct Plan | ELSS | 135781 |
| 2 | Mirae Asset Great Consumer Fund - Direct Plan | Sectoral | 118837 |
| 3 | Mirae Asset Infrastructure Fund - Direct Plan | Sectoral | 153983 |

### HDFC (2)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | HDFC Dividend Yield Fund - Growth Option Direct Plan | Dividend Yield | 148609 |
| 2 | HDFC INNOVATION FUND - DIRECT PLAN | Sectoral | 153620 |

### ICICI Prudential (2)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | ICICI Prudential Large Cap Fund (erstwhile Bluechip Fund) - Direct Plan | Large Cap | 120586 |
| 2 | ICICI Prudential Value Fund (erstwhile Value Discovery Fund) - Direct Plan | Value | 120323 |

### Sundaram (2)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | Sundaram Large Cap Fund (Formerly Known as Sundaram Blue Chip Fund)Direct Plan | Large Cap | 148507 |
| 2 | Sundaram Large and Midcap Fund Direct Plan | Mid Cap | 119566 |

### Union (2)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | Union Business Cycle Fund - Direct Plan | Sectoral | 152409 |
| 2 | Union Consumption Fund - Direct Plan | Sectoral | 154020 |

### 360 ONE (1)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | 360 ONE ELSS Tax Saver Nifty 50 Index Fund - Direct Plan | ELSS | 151165 |

### Navi (1)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | Navi ELSS Tax Saver Fund- Direct Plan | ELSS | 135654 |

### Helios (1)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | Helios Financial Services Fund - Direct Plan | Sectoral | 152679 |

### Kotak (1)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | Kotak Business Cycle - Direct Plan | Sectoral | 150624 |

### Nippon India (1)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | Nippon India MNC Fund- Direct Plan | Sectoral | 153693 |

### Other (1)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | QUANTUM ESG BEST IN CLASS STRATEGY FUND - DIRECT PLAN | Sectoral | 147372 |

### Taurus (1)

| # | Fund name | Category | Scheme code |
|---|-----------|----------|-------------|
| 1 | Taurus Banking & Financial Services Fund - Direct Plan | Sectoral | 118868 |

---

## 3. Fixed by parser/matcher update — no new files (14 funds)

These already exist in parsed JSON or DB under a slightly different slug. **Do not add files** — re-run pipeline after code fix.

| Fund name | AMC | Holder slug in DB |
|-----------|-----|-------------------|
| Mahindra Manulife ELSS Tax Saver Fund - Direct Plan | Mahindra Manulife | mahindra-manulife-innovation-opportunities-fund; mahindra-manulife-consumption-fund-direct-plan |
| Mahindra Manulife Flexi Cap Fund - Direct Plan | Mahindra Manulife | mahindra-manulife-innovation-opportunities-fund; mahindra-manulife-consumption-fund-direct-plan |
| Mahindra Manulife Focused Fund - Direct Plan | Mahindra Manulife | mahindra-manulife-innovation-opportunities-fund; mahindra-manulife-consumption-fund-direct-plan |
| Mahindra Manulife Large Cap Fund - Direct Plan | Mahindra Manulife | mahindra-manulife-innovation-opportunities-fund; mahindra-manulife-consumption-fund-direct-plan |
| Mahindra Manulife Large & Mid Cap Fund - Direct Plan | Mahindra Manulife | mahindra-manulife-innovation-opportunities-fund; mahindra-manulife-consumption-fund-direct-plan |
| Mahindra Manulife Mid Cap Fund - Direct Plan | Mahindra Manulife | mahindra-manulife-innovation-opportunities-fund; mahindra-manulife-consumption-fund-direct-plan |
| Mirae Asset Large & Midcap Fund - Direct Plan | Mirae Asset | mirae-asset-flexi-cap-fund-direct-plan; mirae-asset-focused-fund; mirae-asset-large-cap-fund-direct-plan |
| Bank of India Multi Cap Fund Direct Plan | Bank of India | bank-of-india-flexi-cap-fund; bank-of-india-large-mid-cap-fund; bank-of-india-large-cap-fund |
| Mahindra Manulife Multi Cap Fund - Direct Plan | Mahindra Manulife | mahindra-manulife-innovation-opportunities-fund; mahindra-manulife-consumption-fund-direct-plan |
| Mirae Asset Multicap Fund - Direct Plan | Mirae Asset | mirae-asset-flexi-cap-fund-direct-plan; mirae-asset-focused-fund; mirae-asset-large-cap-fund-direct-plan |
| Mahindra Manulife Business Cycle Fund - Direct Plan | Mahindra Manulife | mahindra-manulife-innovation-opportunities-fund; mahindra-manulife-consumption-fund-direct-plan |
| Mahindra Manulife Manufacturing Fund - Direct Plan | Mahindra Manulife | mahindra-manulife-innovation-opportunities-fund; mahindra-manulife-consumption-fund-direct-plan |
| Mahindra Manulife Small Cap Fund - Direct Plan | Mahindra Manulife | mahindra-manulife-innovation-opportunities-fund; mahindra-manulife-consumption-fund-direct-plan |
| Mahindra Manulife Value Fund - Direct Plan | Mahindra Manulife | mahindra-manulife-innovation-opportunities-fund; mahindra-manulife-consumption-fund-direct-plan |

---

## Summary

| Action | Funds |
|--------|------:|
| Add entire AMC folder | 7 |
| Add individual scheme Excel | 33 |
| Parser/matcher fix only | 14 |
| **Total missing** | **54** |

