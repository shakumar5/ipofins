/** Slim smart-money signal rows for client JSON (drops heavy nested breakdown). */

export function slimSignalRow(row) {
  const {
    factorBreakdown: _fb,
    factorScores: _fs,
    ...rest
  } = row;
  return rest;
}

export function categoryFileSlug(category) {
  return String(category)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function signalCategoryFileName(month, category) {
  const monthSlug = month.toLowerCase().replace(/\s+/g, '-');
  return `${monthSlug}--${categoryFileSlug(category)}.json`;
}
