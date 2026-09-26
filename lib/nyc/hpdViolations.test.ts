import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWhere, fetchHpdViolations } from './hpdViolations';

// 500 W 175th St — counts verified live against NYC Open Data 2026-09-26.
const REF_BBL = '1021310044';
const REF_ROWS = [
  { violationstatus: 'Close', class: 'B', n: '295' },
  { violationstatus: 'Close', class: 'C', n: '139' },
  { violationstatus: 'Close', class: 'A', n: '70' },
  { violationstatus: 'Open', class: 'B', n: '58' },
  { violationstatus: 'Open', class: 'C', n: '27' },
  { violationstatus: 'Open', class: 'A', n: '14' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('buildWhere — guards CLAUDE.md trap #1', () => {
  it('filters on boroid/block/lot, never on bbl', () => {
    const where = buildWhere(REF_BBL);

    // If this ever becomes a `bbl` filter, Socrata returns count 0 with no
    // error and every building in NYC reads as spotless.
    expect(where).not.toMatch(/\bbbl\b/);
    expect(where).toBe("boroid='1' AND block='2131' AND lot='44'");
  });

  it('strips leading zeros — HPD stores block and lot unpadded', () => {
    expect(buildWhere('1000730001')).toBe("boroid='1' AND block='73' AND lot='1'");
  });

  it('accepts the PLUTO float-string form', () => {
    expect(buildWhere('1021310044.00000000')).toBe("boroid='1' AND block='2131' AND lot='44'");
  });
});

describe('fetchHpdViolations', () => {
  it('summarises the reference building by class and status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(REF_ROWS));

    const result = await fetchHpdViolations(REF_BBL, fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.open).toEqual({ a: 14, b: 58, c: 27, other: 0, total: 99 });
    expect(result.data.closed).toEqual({ a: 70, b: 295, c: 139, other: 0, total: 504 });
  });

  it('sends the boroid/block/lot query, grouped', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

    await fetchHpdViolations(REF_BBL, fetchImpl);

    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.searchParams.get('$where')).toBe("boroid='1' AND block='2131' AND lot='44'");
    expect(url.searchParams.get('$group')).toBe('violationstatus,class');
  });

  it('reports a genuinely clean building as zeroes, not as a failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

    const result = await fetchHpdViolations(REF_BBL, fetchImpl);

    expect(result).toEqual({
      ok: true,
      data: {
        open: { a: 0, b: 0, c: 0, other: 0, total: 0 },
        closed: { a: 0, b: 0, c: 0, other: 0, total: 0 },
      },
    });
  });

  it('reports a dead source as failure, NOT as a clean building', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));

    const result = await fetchHpdViolations(REF_BBL, fetchImpl);

    expect(result.ok).toBe(false);
  });

  it('buckets an unexpected class into `other` so totals stay honest', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse([{ violationstatus: 'Open', class: 'I', n: '5' }]),
    );

    const result = await fetchHpdViolations(REF_BBL, fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.open).toEqual({ a: 0, b: 0, c: 0, other: 5, total: 5 });
  });

  it('fails on a malformed BBL instead of querying with garbage', async () => {
    const fetchImpl = vi.fn();

    const result = await fetchHpdViolations('nonsense', fetchImpl);

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
