#!/usr/bin/env node
/** Smoke test for fund-overlap back-link query param resolution (no build required). */
import assert from 'node:assert/strict';

function resolveFundOverlapBack(params) {
  const from = params.get('from');
  if (from !== 'fund-overlap') return null;
  const fundSlug = params.get('fundSlug');
  if (!fundSlug) return null;
  const fundName = params.get('fundName');
  return {
    href: `/mutual-funds/fund-overlap/${fundSlug}`,
    label: fundName ? `Back to ${fundName} overlap` : 'Back to Fund Overlap',
  };
}

const params = new URLSearchParams({
  from: 'fund-overlap',
  fundSlug: '360-one-focused-fund',
  fundName: '360 ONE Focused Fund',
});

const back = resolveFundOverlapBack(params);
assert.ok(back);
assert.equal(back.href, '/mutual-funds/fund-overlap/360-one-focused-fund');
assert.equal(back.label, 'Back to 360 ONE Focused Fund overlap');

const redirectTarget = '/mutual-funds/fund/canara-robeco-focused-fund-direct-plan-holdings';
const search = '?from=fund-overlap&fundSlug=360-one-focused-fund&fundName=360+ONE+Focused+Fund';
assert.equal(`${redirectTarget}${search}`, `${redirectTarget}${search}`);

console.log('verify-list-back-nav: ok');
