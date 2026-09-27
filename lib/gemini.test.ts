import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFactSheet, isGeminiConfigured, summariseBuilding } from './gemini';
import type { Grade } from './grade';
import type { BuildingReport } from './nyc/report';

const clear = <T>(value: T) => ({ value, error: null });
const unavailable = { value: null, error: 'source down' };

function report(overrides: Partial<BuildingReport> = {}): BuildingReport {
  return {
    bbl: '1021620074',
    bin: null,
    facts: clear({
      bbl: '1021620074',
      address: '609 WEST 180 STREET',
      zipcode: '10033',
      unitsRes: 20,
      unitsTotal: 20,
      yearBuilt: 1910,
      numFloors: 5,
      ownerName: null,
    }),
    violations: clear({
      open: { a: 46, b: 179, c: 204, other: 1, total: 430 },
      closed: { a: 0, b: 0, c: 0, other: 0, total: 655 },
    }),
    litigations: clear(36),
    evictions: clear(1),
    bedbugs: clear(0),
    dobViolations: clear(53),
    areaRent: clear({
      zip: '10033',
      latest: { month: '2026-08-31', rent: 3204.26 },
      series: [],
      yearOverYearPct: 6.3,
      projectedNextYear: 3406,
      method: 'x',
    }),
    stabilization: clear({ bbl: '1021620074', isStabilized: false, buildingClass: null }),
    landlord: unavailable,
    openViolationsPerUnit: 21.5,
    generatedAt: '2026-09-26T00:00:00.000Z',
    ...overrides,
  } as BuildingReport;
}

const grade = { letter: 'F', points: 11, maxPoints: 12, rules: [], notAssessed: 0 } as Grade;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  process.env.GEMINI_API_KEY = 'test-key';
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GEMINI_API_KEY;
});

describe('buildFactSheet', () => {
  it('includes the verified figures', () => {
    const sheet = buildFactSheet(report(), grade);

    expect(sheet).toMatch(/609 WEST 180 STREET/);
    expect(sheet).toMatch(/430 total/);
    expect(sheet).toMatch(/21\.50/);
    expect(sheet).toMatch(/\$3204 per month/);
  });

  it('states an unavailable source as unavailable, never as zero', () => {
    // If a gap read as 0, the model would confidently describe a slum as clean.
    const sheet = buildFactSheet(
      report({ litigations: unavailable, bedbugs: unavailable }),
      grade,
    );

    expect(sheet).toMatch(/Housing court cases: unavailable/);
    expect(sheet).toMatch(/Bedbug filings: unavailable/);
    expect(sheet).not.toMatch(/Housing court cases against this building: 0/);
  });

  it('omits the grade line when the building could not be graded', () => {
    expect(buildFactSheet(report(), null)).not.toMatch(/Overall grade/);
  });
});

describe('summariseBuilding', () => {
  it('sends only the fact sheet and returns the text', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ output_text: 'This building is in poor condition.' }));

    const result = await summariseBuilding(report(), grade, fetchImpl);

    expect(result).toEqual({ ok: true, data: 'This building is in poor condition.' });
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('gemini-3.8-flash');
    expect(body.input).toMatch(/609 WEST 180 STREET/);
  });

  it('instructs the model not to give legal advice', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ output_text: 'ok' }));

    await summariseBuilding(report(), grade, fetchImpl);

    // Rights stay rule-based in lib/rights.ts; invented housing law is the one
    // failure mode here that could actually harm someone.
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.system_instruction).toMatch(/Do NOT give legal advice/);
    expect(body.system_instruction).toMatch(/Use ONLY the facts/);
  });

  it('sends the key as a header, never in the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ output_text: 'ok' }));

    await summariseBuilding(report(), grade, fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).not.toMatch(/test-key/);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
  });

  it('fails cleanly when no key is configured', async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchImpl = vi.fn();

    const result = await summariseBuilding(report(), grade, fetchImpl);

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails rather than throwing when the API errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 503));

    expect((await summariseBuilding(report(), grade, fetchImpl)).ok).toBe(false);
  });

  it('falls back to output blocks when output_text is absent', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ output: [{ content: [{ text: 'Block text.' }] }] }));

    const result = await summariseBuilding(report(), grade, fetchImpl);

    expect(result).toEqual({ ok: true, data: 'Block text.' });
  });
});

describe('isGeminiConfigured', () => {
  it('is false for a blank key', () => {
    process.env.GEMINI_API_KEY = '   ';
    expect(isGeminiConfigured()).toBe(false);
  });

  it('is true for a real key', () => {
    expect(isGeminiConfigured()).toBe(true);
  });
});
