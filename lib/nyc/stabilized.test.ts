import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchStabilizationStatus,
  parseStabilizedCsv,
  resetStabilizedCacheForTests,
  rowToBbl,
} from './stabilized';

const HEADER =
  'BOROUGH,ZIP,BUILDING_NO,CLEAN_BUILDING_NO,STREET,BLOCK,LOT,COUNTY,CITY,' +
  'STATUS1,STATUS2,STATUS3,LATITUDE,LONGITUDE';
// 500 W 175th St — confirmed present in the real dataset.
const REF_ROW =
  'Manhattan,10033,500,500,West 175th Street,2131,44,62,NEW YORK,MULTIPLE DWELLING A,,,40.84,-73.94';
// Queens rows carry no STATUS1 in the source data.
const QUEENS_ROW = 'Queens,11373,40-10,4010,82nd Street,1500,7,81,QUEENS,,,,40.74,-73.88';
const CSV = [HEADER, REF_ROW, QUEENS_ROW].join('\n');

const REF_BBL = '1021310044';

function csvResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

beforeEach(() => {
  resetStabilizedCacheForTests();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('rowToBbl', () => {
  it('pads block to 5 and lot to 4', () => {
    expect(rowToBbl('Manhattan', '2131', '44')).toBe(REF_BBL);
  });

  it('maps every borough name to its BBL digit', () => {
    expect(rowToBbl('Bronx', '1', '1')).toBe('2000010001');
    expect(rowToBbl('Brooklyn', '1', '1')).toBe('3000010001');
    expect(rowToBbl('Queens', '1', '1')).toBe('4000010001');
    expect(rowToBbl('Staten Island', '1', '1')).toBe('5000010001');
  });

  it('is case and whitespace insensitive', () => {
    expect(rowToBbl('  manhattan ', '2131', '44')).toBe(REF_BBL);
  });

  it('rejects an unknown borough rather than guessing', () => {
    expect(rowToBbl('Hoboken', '1', '1')).toBeNull();
  });

  it('rejects non-numeric or out-of-range block/lot', () => {
    expect(rowToBbl('Manhattan', 'abc', '44')).toBeNull();
    expect(rowToBbl('Manhattan', '2131', '0')).toBeNull();
    expect(rowToBbl('Manhattan', '999999', '44')).toBeNull();
  });
});

describe('parseStabilizedCsv', () => {
  it('keys rows by BBL', () => {
    const byBbl = parseStabilizedCsv(CSV);

    expect(byBbl.has(REF_BBL)).toBe(true);
    expect(byBbl.get(REF_BBL)).toBe('MULTIPLE DWELLING A');
  });

  it('keeps Queens rows even though they carry no status', () => {
    const byBbl = parseStabilizedCsv(CSV);

    // Presence in the list is the signal; the status text is absent citywide
    // for Queens and must not be used to exclude those buildings.
    expect(byBbl.has('4015000007')).toBe(true);
    expect(byBbl.get('4015000007')).toBeNull();
  });
});

describe('fetchStabilizationStatus', () => {
  it('reports a listed building as stabilized', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(CSV));

    const result = await fetchStabilizationStatus(REF_BBL, fetchImpl);

    expect(result).toEqual({
      ok: true,
      data: { bbl: REF_BBL, isStabilized: true, buildingClass: 'MULTIPLE DWELLING A' },
    });
  });

  it('reports an unlisted building as not stabilized, which is an answer not a failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(CSV));

    const result = await fetchStabilizationStatus('1021620074', fetchImpl);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.isStabilized).toBe(false);
  });

  it('fails loudly on a Git LFS pointer instead of marking everything unstabilized', async () => {
    // raw.githubusercontent.com serves this stub. Parsing it would yield an
    // empty set and quietly tell every tenant their building is not stabilized.
    const pointer =
      'version https://git-lfs.github.com/spec/v1\noid sha256:abc123\nsize 5231164\n';
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(pointer));

    const result = await fetchStabilizationStatus(REF_BBL, fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/LFS pointer/);
  });

  it('fails on a dead source rather than reporting not-stabilized', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse('', 500));

    const result = await fetchStabilizationStatus(REF_BBL, fetchImpl);

    expect(result.ok).toBe(false);
  });

  it('caches the 5MB download across lookups', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(csvResponse(CSV));

    await Promise.all([
      fetchStabilizationStatus(REF_BBL, fetchImpl),
      fetchStabilizationStatus('1021620074', fetchImpl),
    ]);

    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
