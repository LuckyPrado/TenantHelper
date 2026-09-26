import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTokenWarningForTests, socrataCount, socrataQuery, soqlString } from './socrata';

const DATASET = 'wvxf-dwi5';
const KEY = { keyDesc: 'test' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SOCRATA_APP_TOKEN;
});

describe('socrataQuery', () => {
  it('returns rows on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ a: '1' }]));

    const result = await socrataQuery(DATASET, { $limit: '1' }, { ...KEY, fetchImpl });

    expect(result).toEqual({ ok: true, data: [{ a: '1' }] });
  });

  it('builds the dataset URL with the given SoQL params', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

    await socrataQuery(DATASET, { $where: "boroid='1'" }, { ...KEY, fetchImpl });

    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.pathname).toBe(`/resource/${DATASET}.json`);
    expect(url.searchParams.get('$where')).toBe("boroid='1'");
  });

  it('sends X-App-Token when the env var is set', async () => {
    process.env.SOCRATA_APP_TOKEN = 'tok123';
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

    await socrataQuery(DATASET, {}, { ...KEY, fetchImpl });

    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({ 'X-App-Token': 'tok123' });
  });

  it('omits the token header when the env var is blank', async () => {
    process.env.SOCRATA_APP_TOKEN = '   ';
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

    await socrataQuery(DATASET, {}, { ...KEY, fetchImpl });

    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({});
  });

  it('fails on a non-2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 503));

    const result = await socrataQuery(DATASET, {}, { ...KEY, fetchImpl });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/HTTP 503/);
  });

  it('fails on a network error rather than throwing', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

    const result = await socrataQuery(DATASET, {}, { ...KEY, fetchImpl });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ECONNRESET/);
  });

  it('fails on a Socrata error body returned with HTTP 200 (the auth-gated case)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: true, message: 'You must be logged in to access this resource' }),
    );

    const result = await socrataQuery('uwyv-629c', {}, { ...KEY, fetchImpl });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/must be logged in/);
  });

  it('fails when the body is not an array', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ unexpected: true }));

    const result = await socrataQuery(DATASET, {}, { ...KEY, fetchImpl });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/expected an array/);
  });
});

describe('socrataCount', () => {
  it('parses the count_1 aggregate', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ count_1: '430' }]));

    const result = await socrataCount(DATASET, "block='2162'", { ...KEY, fetchImpl });

    expect(result).toEqual({ ok: true, data: 430 });
  });

  it('treats no rows as a genuine zero', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));

    const result = await socrataCount(DATASET, "block='1'", { ...KEY, fetchImpl });

    expect(result).toEqual({ ok: true, data: 0 });
  });

  it('propagates failure instead of reporting zero', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 500));

    const result = await socrataCount(DATASET, "block='1'", { ...KEY, fetchImpl });

    // The whole point: a dead source must never look like a clean building.
    expect(result.ok).toBe(false);
  });

  it('fails when the count is not numeric', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([{ count_1: 'banana' }]));

    const result = await socrataCount(DATASET, "block='1'", { ...KEY, fetchImpl });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not numeric/);
  });
});

describe('soqlString', () => {
  it('quotes a plain value', () => {
    expect(soqlString('LANGSAM')).toBe("'LANGSAM'");
  });

  it("doubles embedded single quotes so O'Brien cannot break the clause", () => {
    expect(soqlString("O'BRIEN")).toBe("'O''BRIEN'");
  });
});

describe('rejected app token', () => {
  it('retries without the token on 403 and warns once', async () => {
    resetTokenWarningForTests();
    process.env.SOCRATA_APP_TOKEN = 'bad-token';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: true, message: 'Invalid app_token' }, 403))
      .mockResolvedValueOnce(jsonResponse([{ count_1: '15' }]));

    const result = await socrataCount(DATASET, "bbl='1'", { ...KEY, fetchImpl });

    expect(result).toEqual({ ok: true, data: 15 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toEqual({
      'X-App-Token': 'bad-token',
    });
    expect((fetchImpl.mock.calls[1][1] as RequestInit).headers).toEqual({});
    expect(warn).toHaveBeenCalledOnce();
  });

  it('does not retry a 403 when no token was sent', async () => {
    resetTokenWarningForTests();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 403));

    const result = await socrataQuery(DATASET, {}, { ...KEY, fetchImpl });

    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
