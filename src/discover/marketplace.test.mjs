import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMarketplace, explain } from './marketplace.mjs';

test('a real employer repeating one role across cities is not a marketplace', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ title: 'Forward Deployed Engineer', loc: `City ${i}` }));
  assert.equal(isMarketplace(rows).marketplace, false);
});

test('the same title at the same location repeated past threshold is a marketplace', () => {
  const rows = Array.from({ length: 13 }, () => ({ title: 'Founding Engineer', loc: 'Remote' }));
  const v = isMarketplace(rows);
  assert.equal(v.marketplace, true);
  assert.equal(v.maxRepeat, 13);
});

test('two open reqs for one role stays under the threshold', () => {
  const rows = [
    { title: 'AI Engineer', loc: 'NYC' }, { title: 'AI Engineer', loc: 'NYC' },
    { title: 'Product Engineer', loc: 'SF' },
  ];
  assert.equal(isMarketplace(rows).marketplace, false);
});

test('explain reports the verdict in one readable line', () => {
  const v = isMarketplace(Array.from({ length: 5 }, () => ({ title: 'X', loc: 'Y' })));
  assert.match(explain('acme', v), /MARKETPLACE/);
});
