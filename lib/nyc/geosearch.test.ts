import { describe, expect, it, vi } from 'vitest';
import { geocodeAddress } from './geosearch';

// Response shape verified live 2026-09-26.
const REF_FEATURE = {
  geometry: { coordinates: [-73.94, 40.84] },
  properties: {
    label: '500 WEST 175 STREET, New York, NY, USA',
    borough: 'Manhattan',
    postalcode: '10033',
    match_type: 'fallback',
    addendum: { pad: { bbl: '1021310044', bin: '1063170', version: '26c' } },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('geocodeAddress', () => {
  it('extracts bbl and bin from addendum.pad', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ features: [REF_FEATURE] }));

    const result = await geocodeAddress('500 West 175 Street Manhattan', fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.bbl).toBe('1021310044');
    expect(result.data.bin).toBe('1063170');
    expect(result.data.zip).toBe('10033');
    expect(result.data.latitude).toBe(40.84);
    expect(result.data.longitude).toBe(-73.94);
  });

  it('surfaces matchType so the UI can warn on a fuzzy hit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ features: [REF_FEATURE] }));

    const result = await geocodeAddress('500 W 175', fetchImpl);

    // The real API returns "fallback" for this address, not "exact".
    expect(result.ok && result.data.matchType).toBe('fallback');
  });

  it('rejects an empty query without calling the API', async () => {
    const fetchImpl = vi.fn();

    const result = await geocodeAddress('   ', fetchImpl);

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails when no feature matches', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ features: [] }));

    const result = await geocodeAddress('not a real place', fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/No NYC address found/);
  });

  it('fails helpfully when the match carries no BBL', async () => {
    const noPad = { properties: { label: 'Broadway & W 96 St', addendum: {} } };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ features: [noPad] }));

    const result = await geocodeAddress('broadway and 96th', fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no building identifier/);
  });
});
