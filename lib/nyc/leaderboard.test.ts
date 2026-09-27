import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLeaderboard } from './leaderboard';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** PLUTO and violations are requested in parallel; resolve by dataset in the URL. */
function routed(pluto: unknown, violations: unknown, status = 200) {
  return vi.fn().mockImplementation((url: string) =>
    Promise.resolve(
      jsonResponse(url.includes('64uk-42ks') ? pluto : violations, status),
    ),
  );
}

const PLUTO = [
  { bbl: '1021620074.00000000', address: '609 WEST 180 STREET', unitsres: '20' },
  { bbl: '1021310044.00000000', address: '2308 AMSTERDAM AVENUE', unitsres: '58' },
  { bbl: '1021790010.00000000', address: '120 CABRINI BOULEVARD', unitsres: '594' },
  { bbl: '1021530001.00000000', address: '1360 ST NICHOLAS AVENUE', unitsres: '480' },
];
const VIOLATIONS = [
  { boroid: '1', block: '2162', lot: '74', n: '430' },
  { boroid: '1', block: '2131', lot: '44', n: '99' },
  // Condo billing lot — must be filtered out entirely.
  { boroid: '1', block: '2164', lot: '7501', n: '591' },
];

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('fetchLeaderboard', () => {
  it('ranks worst by violations per apartment, not raw count', async () => {
    const result = await fetchLeaderboard('10033', routed(PLUTO, VIOLATIONS));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.worst[0].address).toBe('609 WEST 180 STREET');
    expect(result.data.worst[0].openPerUnit).toBeCloseTo(21.5, 1);
    // 99 raw violations is more than nothing, but 1.71/unit ranks below 21.5.
    expect(result.data.worst[1].address).toBe('2308 AMSTERDAM AVENUE');
  });

  it('scores a building with no violation rows as a real zero', async () => {
    const result = await fetchLeaderboard('10033', routed(PLUTO, VIOLATIONS));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Buildings absent from the violations dataset are the whole point of the
    // "best" list; they can only come from the PLUTO side.
    const cabrini = result.data.best.find((e) => e.address === '120 CABRINI BOULEVARD');
    expect(cabrini?.openViolations).toBe(0);
  });

  it('prefers larger buildings among equally clean ones', async () => {
    const result = await fetchLeaderboard('10033', routed(PLUTO, VIOLATIONS));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 594 units clean beats 480 units clean.
    expect(result.data.best[0].address).toBe('120 CABRINI BOULEVARD');
  });

  it('drops condo billing lots (lot >= 7500)', async () => {
    const result = await fetchLeaderboard('10033', routed(PLUTO, VIOLATIONS));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The 591-violation row is a condo billing lot, not a physical building.
    expect(result.data.totalOpenViolations).toBe(529);
  });

  it('rejects a non-NYC ZIP without querying', async () => {
    const fetchImpl = vi.fn();

    const result = await fetchLeaderboard('90210', fetchImpl);

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails when a source is down rather than ranking a partial ZIP', async () => {
    const result = await fetchLeaderboard('10033', routed(PLUTO, VIOLATIONS, 500));

    expect(result.ok).toBe(false);
  });

  it('computes the neighbourhood median for context', async () => {
    const result = await fetchLeaderboard('10033', routed(PLUTO, VIOLATIONS));

    expect(result.ok).toBe(true);
    // Four buildings: 0, 0, 1.71, 21.5 -> median is the mean of the middle two.
    if (result.ok) expect(result.data.medianPerUnit).toBeCloseTo(0.853, 2);
  });
});
