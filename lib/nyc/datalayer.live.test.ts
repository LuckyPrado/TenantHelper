/**
 * LIVE smoke tests — real network, real datasets. Run with `npm run smoke`.
 *
 * These assert the exact numbers recorded in CLAUDE.md. If a dataset schema
 * drifts (a column renamed, a dataset locked behind auth), these fail loudly
 * here rather than silently producing a wrong report during the demo.
 *
 * Excluded from `npm test` so the default suite stays offline and fast.
 */

import { describe, expect, it } from 'vitest';
import { fetchBedbugCount } from './bedbugs';
import { fetchDobViolationCount } from './dobViolations';
import { fetchEvictionCount } from './evictions';
import { geocodeAddress } from './geosearch';
import { fetchHpdViolations } from './hpdViolations';
import { fetchLitigationCount } from './litigations';
import { fetchBuildingFacts } from './pluto';

const REF = {
  address: '500 West 175 Street Manhattan',
  bbl: '1021310044',
  bin: '1063170',
} as const;

// 609 W 180 St — the lead demo building. 430 open across 20 units.
const WORST = { bbl: '1021620074', openTotal: 430, unitsRes: 20 } as const;

describe('live: GeoSearch', () => {
  it('resolves the reference address to its BBL and BIN', async () => {
    const result = await geocodeAddress(REF.address);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.bbl).toBe(REF.bbl);
    expect(result.data.bin).toBe(REF.bin);
  });
});

describe('live: HPD violations', () => {
  it('returns the verified open/closed breakdown', async () => {
    const result = await fetchHpdViolations(REF.bbl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.open).toMatchObject({ a: 14, b: 58, c: 27 });
    expect(result.data.open.total).toBe(99);
    expect(result.data.closed.total).toBe(504);
  });

  it('still finds 430 open at the lead demo building', async () => {
    const result = await fetchHpdViolations(WORST.bbl);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.open.total).toBe(WORST.openTotal);
  });
});

describe('live: per-BBL counts', () => {
  it.each([
    ['litigations', fetchLitigationCount, 15],
    ['evictions', fetchEvictionCount, 3],
    ['bedbugs', fetchBedbugCount, 8],
  ])('%s = %i', async (_label, fetcher, expected) => {
    const result = await fetcher(REF.bbl);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe(expected);
  });
});

describe('live: DOB violations', () => {
  it('counts 19 for the reference BIN', async () => {
    const result = await fetchDobViolationCount(REF.bin);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe(19);
  });
});

describe('live: PLUTO', () => {
  it('supplies the normalization denominator', async () => {
    const result = await fetchBuildingFacts(REF.bbl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.unitsRes).toBe(58);
    expect(result.data.yearBuilt).toBe(1911);
  });
});

describe('live: the product metric end to end', () => {
  it('computes 21.5 open violations per unit at 609 W 180 St', async () => {
    const [violations, facts] = await Promise.all([
      fetchHpdViolations(WORST.bbl),
      fetchBuildingFacts(WORST.bbl),
    ]);

    expect(violations.ok).toBe(true);
    expect(facts.ok).toBe(true);
    if (!violations.ok || !facts.ok) return;

    const perUnit = violations.data.open.total / facts.data.unitsRes;
    expect(facts.data.unitsRes).toBe(WORST.unitsRes);
    expect(perUnit).toBeCloseTo(21.5, 1);
  });
});
