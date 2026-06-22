/**
 * Entity Name Resolver — match raw filing names against curated tracked_entities.
 *
 * Indian Shareholding Pattern filings use inconsistent name formats:
 *   "Khanna Dolly"              vs "Dolly Khanna"
 *   "Damani Radhakishan S"      vs "Radhakishan Damani"
 *   "Govind Capital Pte Ltd"   vs "Govind Capital Pte. Ltd."
 *
 * This module:
 *   1. Builds a lookup index from tracked_entities + their aliases.
 *   2. Matches incoming filing names using normalized token overlap.
 *   3. Returns matches with confidence scores 0..1.
 *   4. Configurable threshold — matches below threshold are skipped (not written
 *      to entity_holdings) but still land in shareholding_pattern_holders for
 *      the 1% Club view.
 */

const MIN_CONFIDENCE_EXACT = 1.0;
const MIN_CONFIDENCE_ALIAS_EXACT = 1.0;
const MIN_CONFIDENCE_TOKEN_OVERLAP = 0.85;
const MIN_CONFIDENCE_PARTIAL = 0.70;

/**
 * Normalize a name for comparison:
 *   - lowercase
 *   - remove punctuation (., Ltd., Limited)
 *   - collapse whitespace
 *   - tokenize into sorted array of unique tokens
 */
function normalizeTokens(name) {
  if (!name) return [];
  return String(name)
    .toLowerCase()
    .replace(/[.\-,]/g, ' ')
    .replace(/\b(ltd|limited|pvt|private|pte)\b/g, '')
    .replace(/\s+(llp|ltd|inc|plc)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 1)
    .sort();
}

function tokenOverlap(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Build an entity resolver index from tracked_entity rows.
 *
 * Call once per pipeline run, then use resolve() for each filing name.
 *
 * @param {Array} entities — rows from `SELECT * FROM tracked_entities WHERE is_active = true`
 * @param {Object} opts
 * @param {number} [opts.minConfidence=0.85] — minimum confidence to accept a match
 * @returns {{ resolve, indexStats }}
 */
export function buildEntityResolver(entities, opts = {}) {
  const minConfidence = opts.minConfidence ?? MIN_CONFIDENCE_TOKEN_OVERLAP;

  // Build index: each entry has the entity row + all name variants (name + aliases)
  // normalized for comparison.
  const index = [];
  for (const entity of entities) {
    const names = [entity.name, ...(entity.aliases || [])].filter(Boolean);
    const entries = names.map((rawName) => ({
      entity,
      rawName,
      normalized: rawName.toLowerCase().trim(),
      tokens: normalizeTokens(rawName),
    }));
    index.push(...entries);
  }

  // Also build a quick exact-match map (normalized → entity) for fast path.
  const exactMap = new Map();
  for (const entry of index) {
    if (!exactMap.has(entry.normalized)) {
      exactMap.set(entry.normalized, entry);
    }
  }

  return {
    /**
     * Resolve a raw filing name to a tracked entity.
     *
     * @param {string} filingName — raw holder name from Shareholding Pattern
     * @returns {{ entityId: number, entityName: string, confidence: number, matchedVariant: string|null }}
     */
    resolve(filingName) {
      if (!filingName) return null;
      const normalized = filingName.toLowerCase().trim();

      // Fast path: exact match on normalized name or any alias.
      const exact = exactMap.get(normalized);
      if (exact) {
        return {
          entityId: exact.entity.id,
          entityName: exact.entity.name,
          confidence: MIN_CONFIDENCE_EXACT,
          matchedVariant: exact.rawName,
        };
      }

      // Slower path: token overlap (handles word-order flips, extra initials).
      const filingTokens = normalizeTokens(filingName);
      if (filingTokens.length === 0) return null;

      let bestMatch = null;
      let bestScore = 0;

      for (const entry of index) {
        // Skip short filing names (e.g. "RBI" matching "LIC") — too risky.
        if (filingTokens.length < 2 && entry.tokens.length < 2) continue;

        const score = tokenOverlap(filingTokens, entry.tokens);

        // Bonus for exact substring containment (handles "Khanna Dolly Chhaganlal" matching "Khanna Dolly").
        const substringBonus = (normalized.includes(entry.normalized) || entry.normalized.includes(normalized)) ? 0.05 : 0;

        // Bonus for token containment (all filing tokens appear in entry).
        const allContained = entry.tokens.length > 0 && filingTokens.every((t) => entry.tokens.includes(t));
        const containBonus = allContained ? 0.03 : 0;

        const totalScore = Math.min(1.0, score + substringBonus + containBonus);

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestMatch = entry;
        }
      }

      if (bestMatch && bestScore >= minConfidence) {
        return {
          entityId: bestMatch.entity.id,
          entityName: bestMatch.entity.name,
          confidence: Math.round(bestScore * 1000) / 1000,
          matchedVariant: bestMatch.rawName,
        };
      }

      // No confident match — this holder stays in 1% Club only.
      return null;
    },

    /** Diagnostic: how many entities + aliases are indexed. */
    indexStats: {
      entityCount: entities.length,
      indexEntries: index.length,
      minConfidence,
    },
  };
}
