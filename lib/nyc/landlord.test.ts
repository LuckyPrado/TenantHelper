import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { choosePortfolioKey, fetchLandlord, type LandlordContact } from './landlord';

const REF_BBL = '1021310044';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Queue responses in call order: registration, contacts, related, [buildings, violations]. */
function queue(...bodies: unknown[]) {
  const impl = vi.fn();
  for (const body of bodies) impl.mockResolvedValueOnce(jsonResponse(body));
  impl.mockResolvedValue(jsonResponse([]));
  return impl;
}

const CONTACTS = [
  { registrationid: '106491', type: 'Agent', corporationname: 'LANGSAM PROP. SERV. CORP.' },
  { registrationid: '106491', type: 'HeadOfficer', firstname: 'FRED', lastname: 'STAHL' },
  { registrationid: '106491', type: 'CorporateOwner', corporationname: 'MAURAY REALTY USA LLC' },
];

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('choosePortfolioKey', () => {
  const agent: LandlordContact = { role: 'Agent', name: 'LANGSAM', isCorporation: true };
  const officer: LandlordContact = { role: 'HeadOfficer', name: 'FRED STAHL', isCorporation: false };
  const owner: LandlordContact = { role: 'CorporateOwner', name: 'MAURAY LLC', isCorporation: true };

  it('prefers the managing agent — the owner LLC is a per-building shell', () => {
    // PLUTO ownername finds 1 building; the agent finds 13. This ordering is
    // the entire reason the portfolio feature works.
    expect(choosePortfolioKey([owner, officer, agent])).toBe(agent);
  });

  it('falls back to the head officer when there is no agent', () => {
    expect(choosePortfolioKey([owner, officer])).toBe(officer);
  });

  it('falls back to the corporate owner when that is all there is', () => {
    expect(choosePortfolioKey([owner])).toBe(owner);
  });

  it('returns null for no contacts', () => {
    expect(choosePortfolioKey([])).toBeNull();
  });
});

describe('fetchLandlord', () => {
  it('resolves contacts and the portfolio via the agent join', async () => {
    const fetchImpl = queue(
      [{ registrationid: '106491' }],
      CONTACTS,
      [{ registrationid: '106491' }, { registrationid: '119129' }],
      [
        { registrationid: '106491', boroid: '1', block: '2131', lot: '44', housenumber: '2308', streetname: 'AMSTERDAM AVENUE' },
        { registrationid: '119129', boroid: '2', block: '3158', lot: '41', housenumber: '2247', streetname: 'RYER AVENUE' },
      ],
      [{ registrationid: '119129', n: '340' }, { registrationid: '106491', n: '99' }],
    );

    const result = await fetchLandlord(REF_BBL, fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.portfolioKey?.name).toBe('LANGSAM PROP. SERV. CORP.');
    expect(result.data.portfolio).toHaveLength(2);
    expect(result.data.portfolioOpenViolations).toBe(439);
  });

  it('sorts the portfolio worst-first', async () => {
    const fetchImpl = queue(
      [{ registrationid: '106491' }],
      CONTACTS,
      [{ registrationid: '106491' }, { registrationid: '119129' }],
      [
        { registrationid: '106491', boroid: '1', block: '2131', lot: '44', housenumber: '2308', streetname: 'AMSTERDAM AVE' },
        { registrationid: '119129', boroid: '2', block: '3158', lot: '41', housenumber: '2247', streetname: 'RYER AVE' },
      ],
      [{ registrationid: '119129', n: '340' }, { registrationid: '106491', n: '99' }],
    );

    const result = await fetchLandlord(REF_BBL, fetchImpl);

    expect(result.ok && result.data.portfolio[0].openViolations).toBe(340);
  });

  it('builds a padded BBL from the registration row', async () => {
    const fetchImpl = queue(
      [{ registrationid: '106491' }],
      CONTACTS,
      [{ registrationid: '106491' }],
      [{ registrationid: '106491', boroid: '1', block: '2131', lot: '44', housenumber: '2308', streetname: 'AMSTERDAM AVENUE' }],
      [],
    );

    const result = await fetchLandlord(REF_BBL, fetchImpl);

    expect(result.ok && result.data.portfolio[0].bbl).toBe('1021310044');
  });

  it('fails when the building has no HPD registration', async () => {
    const fetchImpl = queue([]);

    const result = await fetchLandlord(REF_BBL, fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no HPD registration/);
  });

  it('still returns contacts when the portfolio lookup fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ registrationid: '106491' }]))
      .mockResolvedValueOnce(jsonResponse(CONTACTS))
      .mockResolvedValueOnce(jsonResponse({}, 500));

    const result = await fetchLandlord(REF_BBL, fetchImpl);

    // Degrading to "who runs it, but not what else they run" beats showing nothing.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.contacts).toHaveLength(3);
    expect(result.data.portfolio).toEqual([]);
  });

  it('reports null totals rather than 0 when the violation query fails', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ registrationid: '106491' }]))
      .mockResolvedValueOnce(jsonResponse(CONTACTS))
      .mockResolvedValueOnce(jsonResponse([{ registrationid: '106491' }]))
      .mockResolvedValueOnce(
        jsonResponse([
          { registrationid: '106491', boroid: '1', block: '2131', lot: '44', housenumber: '2308', streetname: 'AMSTERDAM AVE' },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse({}, 503));

    const result = await fetchLandlord(REF_BBL, fetchImpl);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.portfolioOpenViolations).toBeNull();
    expect(result.data.portfolio[0].openViolations).toBeNull();
  });
});
