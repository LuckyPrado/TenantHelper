import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFootprint, fetchFootprintByBbl } from './footprint';

const SQUARE = {
  type: 'Polygon' as const,
  coordinates: [[[-73.94, 40.85], [-73.94, 40.86], [-73.93, 40.86], [-73.93, 40.85], [-73.94, 40.85]]],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('fetchFootprint', () => {
  it('returns the outline and a centre for the camera', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { bin: '1063913', the_geom: SQUARE, height_roof: '70.2', construction_year: '1911' },
      ]),
    );

    const result = await fetchFootprint('1063913', fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.heightFt).toBeCloseTo(70.2);
    expect(result.data.constructionYear).toBe(1911);
    expect(result.data.centre[0]).toBeCloseTo(-73.936, 2);
    expect(result.data.centre[1]).toBeCloseTo(40.854, 2);
  });

  it('handles a MultiPolygon, which is what the dataset actually returns', async () => {
    const multi = { type: 'MultiPolygon' as const, coordinates: [SQUARE.coordinates] };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ bin: '1063913', the_geom: multi }]));

    const result = await fetchFootprint('1063913', fetchImpl);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.centre[1]).toBeCloseTo(40.854, 2);
  });

  it('rejects a BBL passed where a BIN belongs', async () => {
    const fetchImpl = vi.fn();

    expect((await fetchFootprint('1021620074', fetchImpl)).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails when no footprint is on file', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

    const result = await fetchFootprint('1063913', fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/No building footprint/);
  });

  it('treats a height of 0 as unknown rather than ground level', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse([{ bin: '1063913', the_geom: SQUARE, height_roof: '0' }]));

    const result = await fetchFootprint('1063913', fetchImpl);

    expect(result.ok && result.data.heightFt).toBeNull();
  });
});

describe('fetchFootprintByBbl', () => {
  it('queries base_bbl, never bin, and takes the tallest building on the lot', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { bin: '1063913', base_bbl: '1021620074', the_geom: SQUARE, height_roof: '59.1' },
      ]),
    );

    const result = await fetchFootprintByBbl('1021620074', fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.heightFt).toBeCloseTo(59.1);
    expect(result.data.centre[0]).toBeCloseTo(-73.936, 2);

    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain('base_bbl');
    // A BBL in a bin= filter would match nothing and report the building as
    // having no outline, which is the silent-zero failure class.
    expect(url).not.toMatch(/where=bin/);
    // Sorting is done in JS, so the query must not lean on $order.
    expect(url).not.toContain('order');
  });

  it('picks the tallest building when the lot holds several', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { bin: '1000001', base_bbl: '1021620074', the_geom: SQUARE, height_roof: '9.5' },
        { bin: '1000002', base_bbl: '1021620074', the_geom: SQUARE, height_roof: '100.2' },
        { bin: '1000003', base_bbl: '1021620074', the_geom: SQUARE, height_roof: '42' },
      ]),
    );

    const result = await fetchFootprintByBbl('1021620074', fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Lexical ordering would have picked 9.5 here, which is the whole reason
    // this is not done with $order.
    expect(result.data.heightFt).toBeCloseTo(100.2);
    expect(result.data.bin).toBe('1000002');
  });

  it('skips rows with no geometry rather than reporting no footprint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([
        { bin: '1000001', base_bbl: '1021620074', height_roof: '900' },
        { bin: '1000002', base_bbl: '1021620074', the_geom: SQUARE, height_roof: '30' },
      ]),
    );

    const result = await fetchFootprintByBbl('1021620074', fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.bin).toBe('1000002');
  });

  it('rejects a BIN passed where a BBL belongs rather than querying for it', async () => {
    const fetchImpl = vi.fn();

    const result = await fetchFootprintByBbl('1063913', fetchImpl);

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails loudly when the lot has no footprint on file', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

    const result = await fetchFootprintByBbl('1021620074', fetchImpl);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('1021620074');
  });
});
