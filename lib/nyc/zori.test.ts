import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAreaRent, parseZoriCsv, resetZoriCacheForTests, splitCsvLine } from './zori';

// Mirrors the real file: 9 metadata columns then monthly dates, with the Metro
// column quoted and containing a comma.
const HEADER =
  'RegionID,SizeRank,RegionName,RegionType,StateName,State,City,Metro,CountyName,' +
  '2025-08-31,2025-09-30,2026-07-31,2026-08-31';
const NYC_ROW =
  '61647,750,10033,zip,NY,NY,New York,"New York-Newark-Jersey City, NY-NJ-PA",New York County,' +
  '3000,,3100,3300';
const NON_NYC_ROW =
  '12345,10,90210,zip,CA,CA,Beverly Hills,"Los Angeles, CA",LA County,5000,5100,5200,5300';
const CSV = [HEADER, NYC_ROW, NON_NYC_ROW].join('\n');

function csvResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

beforeEach(() => {
  resetZoriCacheForTests();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('splitCsvLine', () => {
  it('keeps a quoted comma inside one field', () => {
    // Without this, every column after Metro shifts and rent is read from the
    // wrong month — silently, with plausible-looking numbers.
    const fields = splitCsvLine(NYC_ROW);

    expect(fields[7]).toBe('New York-Newark-Jersey City, NY-NJ-PA');
    expect(fields[2]).toBe('10033');
    expect(fields).toHaveLength(13);
  });

  it('unescapes a doubled quote', () => {
    expect(splitCsvLine('a,"say ""hi""",b')[1]).toBe('say "hi"');
  });

  it('preserves empty trailing fields', () => {
    expect(splitCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });
});

describe('parseZoriCsv', () => {
  it('keeps NYC ZIPs and drops the rest', () => {
    const byZip = parseZoriCsv(CSV);

    expect([...byZip.keys()]).toEqual(['10033']);
  });

  it('skips empty months rather than reading them as zero rent', () => {
    const series = parseZoriCsv(CSV).get('10033');

    expect(series).toEqual([
      { month: '2025-08-31', rent: 3000 },
      { month: '2026-07-31', rent: 3100 },
      { month: '2026-08-31', rent: 3300 },
    ]);
  });
});

describe('fetchAreaRent', () => {
  it('returns the latest rent for a NYC ZIP', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(CSV));

    const result = await fetchAreaRent('10033', fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.latest).toEqual({ month: '2026-08-31', rent: 3300 });
  });

  it('rejects a non-NYC ZIP without downloading 10MB', async () => {
    const fetchImpl = vi.fn();

    const result = await fetchAreaRent('90210', fetchImpl);

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails for a NYC ZIP Zillow does not publish', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(CSV));

    const result = await fetchAreaRent('10001', fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no rent index/);
  });

  it('caches, so concurrent report renders do not each pull the file', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(CSV));

    await Promise.all([
      fetchAreaRent('10033', fetchImpl),
      fetchAreaRent('10033', fetchImpl),
      fetchAreaRent('10033', fetchImpl),
    ]);

    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('reports a fetch failure instead of a rent of zero', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse('', 503));

    const result = await fetchAreaRent('10033', fetchImpl);

    expect(result.ok).toBe(false);
  });

  it('leaves the projection null when there is under a year of history', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(CSV));

    const result = await fetchAreaRent('10033', fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only 3 data points, so no year-ago comparison is possible.
    expect(result.data.yearOverYearPct).toBeNull();
    expect(result.data.projectedNextYear).toBeNull();
    expect(result.data.method).toMatch(/Not enough history/);
  });
});
