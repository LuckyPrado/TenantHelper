import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFootprint } from './footprint';

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
