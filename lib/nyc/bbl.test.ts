import { describe, expect, it } from 'vitest';
import { decomposeBbl, normalizeBbl } from './bbl';

// Reference building: 500 W 175th St. Values verified live against NYC Open Data.
const REF = '1021310044';

describe('normalizeBbl', () => {
  it('accepts GeoSearch form', () => {
    expect(normalizeBbl(REF)).toBe(REF);
  });

  it('accepts PLUTO float-string form (trap 2)', () => {
    expect(normalizeBbl('1021310044.00000000')).toBe(REF);
  });

  it('rejects wrong length rather than silently truncating', () => {
    expect(() => normalizeBbl('102131')).toThrow(/expected 10 digits/);
  });

  it('rejects an out-of-range borough digit', () => {
    expect(() => normalizeBbl('9021310044')).toThrow(/borough digit/);
  });
});

describe('decomposeBbl', () => {
  it('produces the UNPADDED parts HPD needs (trap 1)', () => {
    expect(decomposeBbl(REF)).toEqual({ boroid: '1', block: '2131', lot: '44' });
  });

  it('strips leading zeros from block and lot', () => {
    // BBL 1000730001 -> block 73, lot 1 (not '00073' / '0001')
    expect(decomposeBbl('1000730001')).toEqual({ boroid: '1', block: '73', lot: '1' });
  });
});
