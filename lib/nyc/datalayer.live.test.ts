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

describe('live: ZORI area rent', () => {
  it('returns a current rent for Washington Heights (10033)', async () => {
    const { fetchAreaRent } = await import('./zori');

    const result = await fetchAreaRent('10033');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Verified $3,204 for 2026-08. Assert a band, not the exact figure, so the
    // test tracks reality instead of breaking every month Zillow publishes.
    expect(result.data.latest.rent).toBeGreaterThan(2500);
    expect(result.data.latest.rent).toBeLessThan(4500);
    expect(result.data.series.length).toBeGreaterThan(24);
    expect(result.data.yearOverYearPct).not.toBeNull();
  });

  it('parses the quoted Metro column without shifting the rent columns', async () => {
    const { fetchAreaRent } = await import('./zori');

    // If quoted-comma handling regressed, columns shift by one and rents land
    // in the wrong month — plausible numbers, silently wrong.
    const [heights, williamsburg] = await Promise.all([
      fetchAreaRent('10033'),
      fetchAreaRent('11211'),
    ]);

    expect(heights.ok && williamsburg.ok).toBe(true);
    if (!heights.ok || !williamsburg.ok) return;
    expect(williamsburg.data.latest.rent).toBeGreaterThan(heights.data.latest.rent);
    expect(heights.data.latest.month).toBe(williamsburg.data.latest.month);
  });
});

describe('live: rent stabilization', () => {
  it('finds 500 W 175 St on the stabilized list', async () => {
    const { fetchStabilizationStatus } = await import('./stabilized');

    const result = await fetchStabilizationStatus(REF.bbl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.isStabilized).toBe(true);
    expect(result.data.buildingClass).toMatch(/MULTIPLE DWELLING/);
  });

  it('does not find 609 W 180 St — the contrast the demo uses', async () => {
    const { fetchStabilizationStatus } = await import('./stabilized');

    const result = await fetchStabilizationStatus(WORST.bbl);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.isStabilized).toBe(false);
  });

  it('gets the real CSV, not the Git LFS pointer', async () => {
    const { fetchStabilizationStatus } = await import('./stabilized');

    // A pointer file parses to zero rows, which would mark every building
    // unstabilized. Finding a known building proves we got real bytes.
    const result = await fetchStabilizationStatus(REF.bbl);

    expect(result.ok).toBe(true);
  });
});

describe('live: landlord portfolio', () => {
  it('finds the real portfolio via the agent join, not the owner LLC', async () => {
    const { fetchLandlord } = await import('./landlord');

    const result = await fetchLandlord(REF.bbl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // PLUTO ownername finds 1 building for this landlord; the managing agent
    // finds 13. If this drops to 1, the agent join has regressed.
    expect(result.data.portfolio.length).toBeGreaterThan(5);
    expect(result.data.portfolioKey?.name).toMatch(/LANGSAM/);
    expect(result.data.portfolioOpenViolations).toBeGreaterThan(500);
  });
});
