import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBblCountFetcher } from './bblCount';
import { BEDBUGS_DATASET, fetchBedbugCount } from './bedbugs';
import { EVICTIONS_DATASET, fetchEvictionCount } from './evictions';
import { LITIGATIONS_DATASET, fetchLitigationCount } from './litigations';

const REF_BBL = '1021310044';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('makeBblCountFetcher', () => {
  it('queries the given dataset filtered on bbl', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ count_1: '15' }]));

    const result = await makeBblCountFetcher('59kj-x8nc')(REF_BBL, fetchImpl);

    expect(result).toEqual({ ok: true, data: 15 });
    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/resource/59kj-x8nc.json');
    expect(url.searchParams.get('$where')).toBe("bbl='1021310044'");
  });

  it('normalizes the PLUTO float-string form before querying', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ count_1: '0' }]));

    await makeBblCountFetcher('6z8x-wfk4')('1021310044.00000000', fetchImpl);

    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.searchParams.get('$where')).toBe("bbl='1021310044'");
  });

  it('rejects a malformed BBL without issuing a request', async () => {
    const fetchImpl = vi.fn();

    const result = await makeBblCountFetcher('59kj-x8nc')('12', fetchImpl);

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces a dead source as failure, not as zero', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 502));

    const result = await makeBblCountFetcher('59kj-x8nc')(REF_BBL, fetchImpl);

    expect(result.ok).toBe(false);
  });
});

describe('source modules point at the verified dataset ids', () => {
  it.each([
    ['litigations', LITIGATIONS_DATASET, '59kj-x8nc', fetchLitigationCount, '15'],
    ['evictions', EVICTIONS_DATASET, '6z8x-wfk4', fetchEvictionCount, '3'],
    ['bedbugs', BEDBUGS_DATASET, 'wz6d-d3jb', fetchBedbugCount, '8'],
  ])('%s uses %s', async (_name, actual, expected, fetcher, verifiedCount) => {
    expect(actual).toBe(expected);

    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ count_1: verifiedCount }]));
    const result = await fetcher(REF_BBL, fetchImpl);

    expect(result).toEqual({ ok: true, data: Number(verifiedCount) });
    expect(new URL(fetchImpl.mock.calls[0][0] as string).pathname).toBe(`/resource/${expected}.json`);
  });
});
