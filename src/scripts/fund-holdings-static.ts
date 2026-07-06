/**
 * Client-side pagination + weight sort for FundHoldingsStaticTable.
 * All holdings are embedded in a JSON script tag at SSR — no network fetch.
 */

export interface FundHoldingRowClient {
  name: string;
  sector: string;
  pct: number;
  stockSlug?: string;
  isin?: string;
  nseSymbol?: string;
  bseCode?: string;
}

export interface FundHoldingsTableOptions {
  root: HTMLElement;
  tableId: string;
  holdingsDataId: string;
  fundSlug: string;
  fundName: string;
  rowsPage?: number;
}

function readRows(holdingsDataId: string): FundHoldingRowClient[] {
  const el = document.getElementById(holdingsDataId);
  if (!el) return [];
  try {
    const parsed = JSON.parse(el.textContent || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function compareHoldings(a: FundHoldingRowClient, b: FundHoldingRowClient, dir: 'asc' | 'desc') {
  const pctDiff = (Number(a.pct) || 0) - (Number(b.pct) || 0);
  if (pctDiff !== 0) return dir === 'asc' ? pctDiff : -pctDiff;
  const nameDiff = String(a.name || '').localeCompare(String(b.name || ''));
  return dir === 'asc' ? nameDiff : -nameDiff;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function initFundHoldingsStaticTable(options: FundHoldingsTableOptions) {
  const {
    root,
    tableId,
    holdingsDataId,
    fundSlug,
    fundName,
    rowsPage = 20,
  } = options;

  const tbodyEl = document.getElementById(tableId);
  if (!tbodyEl) return;
  const tbody: HTMLElement = tbodyEl;

  const allRows = readRows(holdingsDataId);
  if (!allRows.length) {
    // JSON payload missing — keep SSR rows; don't wipe the table.
    return;
  }

  let visibleLimit = Math.min(rowsPage, allRows.length);
  let weightSortDir: 'asc' | 'desc' = 'desc';
  let isinIndex: Map<string, string> | null = null;
  let nseIndex: Map<string, string> | null = null;
  let bseIndex: Map<string, string> | null = null;
  let indexesReady = false;

  const moreWrap = root.querySelector<HTMLElement>('[data-fund-holdings-more-wrap]');
  const moreBtn = root.querySelector<HTMLButtonElement>('[data-fund-holdings-more]');
  const sortWeightBtns = root.querySelectorAll<HTMLButtonElement>('[data-fund-holdings-sort-weight]');

  function ingestJsonIndex(map: Map<string, string>, data: Record<string, string> | null, normalizeKey: (k: string) => string) {
    if (!data) return;
    for (const [code, slug] of Object.entries(data)) {
      const key = normalizeKey(String(code || ''));
      const s = String(slug || '').trim();
      if (key && s && !map.has(key)) map.set(key, s);
    }
  }

  function resolveSlug(h: FundHoldingRowClient) {
    const preset = String(h.stockSlug || '').trim();
    if (preset) return preset;
    const isin = String(h.isin || '').trim().toUpperCase();
    if (isin && isinIndex?.has(isin)) return isinIndex.get(isin)!;
    const nse = String(h.nseSymbol || '').trim().toUpperCase();
    if (nse && nseIndex?.has(nse)) return nseIndex.get(nse)!;
    const bse = String(h.bseCode || '').trim();
    if (bse && bseIndex?.has(bse)) return bseIndex.get(bse)!;
    return '';
  }

  function stockHref(slug: string) {
    const base = `/mutual-funds/smart-money/stock-signal/${encodeURIComponent(slug)}`;
    const params = new URLSearchParams({
      from: 'fund',
      fundSlug: fundSlug.replace(/-holdings$/, '') + '-holdings',
      fundName,
    });
    return `${base}?${params.toString()}`;
  }

  function rowHtml(h: FundHoldingRowClient, index: number) {
    const stripe = index % 2 === 0 ? '' : ' bg-surface-50 dark:bg-surface-800/50';
    const slug = resolveSlug(h);
    const safeName = escapeHtml(String(h.name || ''));
    const safeSector = escapeHtml(String(h.sector || ''));
    const nameCell = slug
      ? `<a href="${stockHref(slug)}" class="font-medium text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline">${safeName}</a>`
      : `<span class="font-medium text-sm text-surface-900 dark:text-white">${safeName}</span>`;
    return (
      `<div class="grid grid-cols-12 gap-4 px-4 py-2.5 text-sm items-center${stripe}" data-holding-row>` +
      `<div class="col-span-1 text-xs text-surface-400">${index + 1}</div>` +
      `<div class="col-span-5">${nameCell}` +
      `<p class="text-[10px] text-surface-400 md:hidden">${safeSector}</p></div>` +
      `<div class="col-span-3 text-xs text-surface-500 hidden md:block">${safeSector}</div>` +
      `<div class="col-span-3 text-right"><span class="text-sm font-semibold text-primary-600">${h.pct}%</span></div>` +
      `</div>`
    );
  }

  function sortedRows() {
    return allRows.slice().sort((a, b) => compareHoldings(a, b, weightSortDir));
  }

  function updateSortHeader() {
    const icon = weightSortDir === 'asc' ? '↑' : '↓';
    const ariaSort = weightSortDir === 'asc' ? 'ascending' : 'descending';
    sortWeightBtns.forEach((btn) => {
      btn.setAttribute('aria-sort', ariaSort);
      const iconEl = btn.querySelector('[data-fund-holdings-sort-icon]');
      if (iconEl) iconEl.textContent = icon;
    });
  }

  function updateMoreButton() {
    if (!moreWrap || !moreBtn) return;
    const show = visibleLimit < allRows.length;
    moreWrap.hidden = !show;
    if (!show) return;
    const remaining = allRows.length - visibleLimit;
    moreBtn.textContent = `Show more (${Math.max(remaining, 0)} remaining)`;
    moreBtn.disabled = false;
  }

  function render() {
    const slice = sortedRows().slice(0, visibleLimit);
    tbody.innerHTML = slice.map((h, i) => rowHtml(h, i)).join('');
    const shownEl = root.querySelector('[data-fund-holdings-shown]');
    const totalEl = root.querySelector('[data-fund-holdings-total]');
    if (shownEl) shownEl.textContent = String(slice.length);
    if (totalEl) totalEl.textContent = String(allRows.length);
    updateMoreButton();
  }

  async function loadListingIndexes() {
    if (indexesReady) return;
    isinIndex = isinIndex || new Map();
    nseIndex = nseIndex || new Map();
    bseIndex = bseIndex || new Map();
    try {
      const isinRes = await fetch('/data/stock-isin-slug-index.json');
      if (isinRes.ok) {
        ingestJsonIndex(isinIndex, await isinRes.json(), (k) => k.trim().toUpperCase());
      }
      const nseRes = await fetch('/data/stock-nse-slug-index.json');
      if (nseRes.ok) {
        ingestJsonIndex(nseIndex, await nseRes.json(), (k) => k.trim().toUpperCase());
      }
      const bseRes = await fetch('/data/stock-bse-slug-index.json');
      if (bseRes.ok) {
        ingestJsonIndex(bseIndex, await bseRes.json(), (k) => k.trim());
      }
    } catch {
      // links stay plain text when indexes are unavailable
    } finally {
      indexesReady = true;
    }
  }

  function handleShowMore() {
    if (visibleLimit >= allRows.length) return;
    visibleLimit = Math.min(visibleLimit + rowsPage, allRows.length);
    render();
  }

  moreBtn?.addEventListener('click', handleShowMore);
  sortWeightBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      weightSortDir = weightSortDir === 'asc' ? 'desc' : 'asc';
      updateSortHeader();
      render();
    });
  });

  updateSortHeader();
  render();
  void loadListingIndexes().then(() => render());
}
