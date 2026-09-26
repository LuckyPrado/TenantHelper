import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDobViolationCount } from './dobViolations';

const REF_BIN = '1063170';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('fetchDobViolationCount', () => {
  it('counts violations for the reference BIN', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ count_1: '19' }]));

    const result = await fetchDobViolationCount(REF_BIN, fetchImpl);

    expect(result).toEqual({ ok: true, data: 19 });
    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/resource/3h2n-5cm9.json');
    expect(url.searchParams.get('$where')).toBe("bin='1063170'");
  });

  it('rejects a BBL passed where a BIN belongs', async () => {
    const fetchImpl = vi.fn();

    const result = await fetchDobViolationCount('1021310044', fetchImpl);

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('propagates source failure rather than reporting zero', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));

    expect((await fetchDobViolationCount(REF_BIN, fetchImpl)).ok).toBe(false);
  });
});
