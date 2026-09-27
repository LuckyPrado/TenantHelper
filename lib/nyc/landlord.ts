/**
 * Who runs this building, and what else they run.
 *
 * ⚠️ The obvious join does not work. NYC landlords register one LLC per
 * building by design, so joining on PLUTO's `ownername` finds exactly one
 * building. Joining on the HPD *managing agent* or head officer finds the real
 * portfolio — 13 buildings vs 1 for the reference case. Always use the agent join.
 *
 * Facts only: buildings and counts, no grade or judgement. The landlord rating
 * was shelved deliberately (no rating data exists anywhere).
 */

import { decomposeBbl, normalizeBbl } from './bbl';
import { fail, ok, type Result } from './result';
import { socrataQuery, soqlString } from './socrata';

const REGISTRATIONS_DATASET = 'tesw-yqqr';
const CONTACTS_DATASET = 'feu5-w2e2';
const VIOLATIONS_DATASET = 'wvxf-dwi5';

/** Keeps the portfolio query and the UI list to a sane size. */
const MAX_PORTFOLIO_BUILDINGS = 60;

export interface LandlordContact {
  readonly role: string;
  readonly name: string;
  readonly isCorporation: boolean;
}

export interface PortfolioBuilding {
  readonly registrationId: string;
  readonly bbl: string;
  readonly address: string;
  readonly openViolations: number | null;
}

export interface Landlord {
  readonly registrationId: string;
  readonly contacts: readonly LandlordContact[];
  /** The identity the portfolio was assembled from, or null if none was usable. */
  readonly portfolioKey: LandlordContact | null;
  readonly portfolio: readonly PortfolioBuilding[];
  /** Total across the portfolio, or null if the violation lookup failed. */
  readonly portfolioOpenViolations: number | null;
  /** True when the portfolio was larger than MAX_PORTFOLIO_BUILDINGS. */
  readonly truncated: boolean;
}

interface RegistrationRow {
  readonly registrationid?: string;
  readonly boroid?: string;
  readonly block?: string;
  readonly lot?: string;
  readonly housenumber?: string;
  readonly streetname?: string;
}

interface ContactRow {
  readonly registrationid?: string;
  readonly type?: string;
  readonly firstname?: string;
  readonly lastname?: string;
  readonly corporationname?: string;
}

function toContact(row: ContactRow): LandlordContact | null {
  const corporation = row.corporationname?.trim() ?? '';
  const person = [row.firstname?.trim(), row.lastname?.trim()].filter(Boolean).join(' ');
  const name = corporation !== '' ? corporation : person;
  if (name === '') return null;
  return { role: row.type?.trim() ?? 'Unknown', name, isCorporation: corporation !== '' };
}

/**
 * Pick the identity most likely to reveal the real portfolio.
 *
 * Managing agent first: it is a real operating company rather than a
 * single-building shell, so it links the most buildings.
 */
export function choosePortfolioKey(
  contacts: readonly LandlordContact[],
): LandlordContact | null {
  const byRole = (role: string, corporate: boolean): LandlordContact | undefined =>
    contacts.find((c) => c.role.toLowerCase() === role && c.isCorporation === corporate);

  return (
    byRole('agent', true) ??
    byRole('headofficer', false) ??
    byRole('corporateowner', true) ??
    contacts[0] ??
    null
  );
}

function registrationToBbl(row: RegistrationRow): string | null {
  const boroid = row.boroid?.trim();
  const block = Number(row.block);
  const lot = Number(row.lot);
  if (boroid === undefined || !Number.isInteger(block) || !Number.isInteger(lot)) return null;
  try {
    return normalizeBbl(
      `${boroid}${String(block).padStart(5, '0')}${String(lot).padStart(4, '0')}`,
    );
  } catch {
    return null;
  }
}

function matchClause(key: LandlordContact): string {
  if (key.isCorporation) return `corporationname=${soqlString(key.name)}`;
  const [first, ...rest] = key.name.split(' ');
  const last = rest.join(' ');
  return `firstname=${soqlString(first)} AND lastname=${soqlString(last)}`;
}

/** Open violation counts for a batch of registrations, in one grouped query. */
async function openViolationsByRegistration(
  registrationIds: readonly string[],
  fetchImpl?: typeof fetch,
): Promise<Map<string, number> | null> {
  if (registrationIds.length === 0) return new Map();

  const list = registrationIds.map(soqlString).join(',');
  const rows = await socrataQuery<{ registrationid?: string; n?: string }>(
    VIOLATIONS_DATASET,
    {
      $select: 'registrationid,count(1) as n',
      $where: `violationstatus='Open' AND registrationid in (${list})`,
      $group: 'registrationid',
    },
    { keyDesc: `portfolio(${registrationIds.length})`, fetchImpl },
  );
  if (!rows.ok) return null;

  const counts = new Map<string, number>();
  for (const row of rows.data) {
    const id = row.registrationid?.trim();
    const n = Number(row.n);
    if (id !== undefined && Number.isFinite(n)) counts.set(id, n);
  }
  return counts;
}

/** The landlord for one building, plus their other buildings. */
export async function fetchLandlord(
  bbl: string,
  fetchImpl?: typeof fetch,
): Promise<Result<Landlord>> {
  let parts: { boroid: string; block: string; lot: string };
  try {
    parts = decomposeBbl(bbl);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const registrations = await socrataQuery<RegistrationRow>(
    REGISTRATIONS_DATASET,
    {
      $select: 'registrationid',
      $where: [
        `boroid=${soqlString(parts.boroid)}`,
        `block=${soqlString(parts.block)}`,
        `lot=${soqlString(parts.lot)}`,
      ].join(' AND '),
      $limit: '1',
    },
    { keyDesc: `bbl=${bbl}`, fetchImpl },
  );
  if (!registrations.ok) return registrations;

  const registrationId = registrations.data[0]?.registrationid?.trim();
  if (registrationId === undefined || registrationId === '') {
    return fail('This building has no HPD registration on file.');
  }

  const contactRows = await socrataQuery<ContactRow>(
    CONTACTS_DATASET,
    { $where: `registrationid=${soqlString(registrationId)}`, $limit: '50' },
    { keyDesc: `reg=${registrationId}`, fetchImpl },
  );
  if (!contactRows.ok) return contactRows;

  const contacts = contactRows.data.map(toContact).filter((c): c is LandlordContact => c !== null);
  const portfolioKey = choosePortfolioKey(contacts);

  if (portfolioKey === null) {
    return ok({
      registrationId,
      contacts,
      portfolioKey: null,
      portfolio: [],
      portfolioOpenViolations: null,
      truncated: false,
    });
  }

  const related = await socrataQuery<ContactRow>(
    CONTACTS_DATASET,
    { $select: 'registrationid', $where: matchClause(portfolioKey), $limit: '2000' },
    { keyDesc: `portfolio-key=${portfolioKey.name}`, fetchImpl },
  );
  if (!related.ok) {
    return ok({
      registrationId,
      contacts,
      portfolioKey,
      portfolio: [],
      portfolioOpenViolations: null,
      truncated: false,
    });
  }

  const allIds = [
    ...new Set(related.data.map((r) => r.registrationid?.trim()).filter((v): v is string => !!v)),
  ];
  const ids = allIds.slice(0, MAX_PORTFOLIO_BUILDINGS);

  const [buildingRows, violationCounts] = await Promise.all([
    socrataQuery<RegistrationRow>(
      REGISTRATIONS_DATASET,
      {
        $select: 'registrationid,boroid,block,lot,housenumber,streetname',
        $where: `registrationid in (${ids.map(soqlString).join(',')})`,
        $limit: String(MAX_PORTFOLIO_BUILDINGS),
      },
      { keyDesc: `portfolio(${ids.length})`, fetchImpl },
    ),
    openViolationsByRegistration(ids, fetchImpl),
  ]);

  const portfolio: PortfolioBuilding[] = [];
  if (buildingRows.ok) {
    for (const row of buildingRows.data) {
      const id = row.registrationid?.trim();
      const buildingBbl = registrationToBbl(row);
      if (id === undefined || buildingBbl === null) continue;
      portfolio.push({
        registrationId: id,
        bbl: buildingBbl,
        address: [row.housenumber?.trim(), row.streetname?.trim()].filter(Boolean).join(' '),
        openViolations: violationCounts?.get(id) ?? (violationCounts === null ? null : 0),
      });
    }
  }

  portfolio.sort((a, b) => (b.openViolations ?? 0) - (a.openViolations ?? 0));

  return ok({
    registrationId,
    contacts,
    portfolioKey,
    portfolio,
    portfolioOpenViolations:
      violationCounts === null ? null : [...violationCounts.values()].reduce((a, b) => a + b, 0),
    truncated: allIds.length > MAX_PORTFOLIO_BUILDINGS,
  });
}
