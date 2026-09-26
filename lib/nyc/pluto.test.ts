import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBuildingFacts } from './pluto';

const REF_BBL = '1021310044';
// Shape verified live: PLUTO returns bbl as a float string and numbers as strings.
const REF_ROW = {
  bbl: '1021310044.00000000',
  address: '2308 AMSTERDAM AVENUE',
  unitsres: '58',
  unitstotal: '62',
  yearbuilt: '1911',
  numfloors: '6.0000000',
  ownername: 'MAURAY REALTY USA LLC',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('fetchBuildingFacts', () => {
  it('parses the reference building', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([REF_ROW]));

    const result = await fetchBuildingFacts(REF_BBL, fetchImpl);

    expect(result).toEqual({
      ok: true,
      data: {
        bbl: '1021310044',
        address: '2308 AMSTERDAM AVENUE',
        unitsRes: 58,
        unitsTotal: 62,
        yearBuilt: 1911,
        numFloors: 6,
        ownerName: 'MAURAY REALTY USA LLC',
      },
    });
  });

  it('returns the clean BBL, not the float string PLUTO echoed back', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([REF_ROW]));

    const result = await fetchBuildingFacts('1021310044.00000000', fetchImpl);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.bbl).toBe('1021310044');
  });

  it('fails when the lot has no residential units, so no per-unit rate is invented', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse([{ ...REF_ROW, unitsres: '0' }]));

    const result = await fetchBuildingFacts(REF_BBL, fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/cannot be computed/);
  });

  it('fails when PLUTO has no record for the BBL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

    const result = await fetchBuildingFacts(REF_BBL, fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no PLUTO record/);
  });

  it('treats PLUTO year 0 as unknown rather than year zero', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse([{ ...REF_ROW, yearbuilt: '0' }]));

    const result = await fetchBuildingFacts(REF_BBL, fetchImpl);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.yearBuilt).toBeNull();
  });
});
