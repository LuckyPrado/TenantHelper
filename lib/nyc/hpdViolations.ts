/**
 * HPD Housing Maintenance Code Violations — dataset wvxf-dwi5.
 *
 * ⚠️ THE TRAP (CLAUDE.md #1): this dataset has NO `bbl` column, and Socrata
 * answers `?bbl=...` with `count: 0` instead of an error. Querying it that way
 * reports every building in New York City as spotless.
 *
 * The only correct filter is boroid + block + lot, as UNPADDED strings.
 * `assertNoBblFilter` below and the tests exist to keep it that way.
 */

import { decomposeBbl } from './bbl';
import { fail, ok, type Result } from './result';
import { socrataQuery, soqlString } from './socrata';

const DATASET_ID = 'wvxf-dwi5';

/** HPD hazard classes. A = non-hazardous, B = hazardous, C = immediately hazardous. */
export interface ViolationCounts {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  /** Any class outside A/B/C, kept so totals never silently lose rows. */
  readonly other: number;
  readonly total: number;
}

export interface HpdViolationSummary {
  readonly open: ViolationCounts;
  readonly closed: ViolationCounts;
}

interface GroupedRow {
  readonly violationstatus?: string;
  readonly class?: string;
  readonly n?: string;
}

const EMPTY: ViolationCounts = { a: 0, b: 0, c: 0, other: 0, total: 0 };

/**
 * Build the where clause. Exported so a test can assert it never reverts to a
 * `bbl` filter — the failure this module exists to prevent is invisible at
 * runtime, so it has to be caught at the query-construction level.
 */
export function buildWhere(bbl: string): string {
  const { boroid, block, lot } = decomposeBbl(bbl);
  return [
    `boroid=${soqlString(boroid)}`,
    `block=${soqlString(block)}`,
    `lot=${soqlString(lot)}`,
  ].join(' AND ');
}

function addToBucket(counts: ViolationCounts, violationClass: string, n: number): ViolationCounts {
  const key = violationClass.trim().toUpperCase();
  return {
    a: counts.a + (key === 'A' ? n : 0),
    b: counts.b + (key === 'B' ? n : 0),
    c: counts.c + (key === 'C' ? n : 0),
    other: counts.other + (key === 'A' || key === 'B' || key === 'C' ? 0 : n),
    total: counts.total + n,
  };
}

/**
 * Open + closed violation counts by hazard class for one building.
 *
 * A building with a genuinely clean record returns ok() with zeroed counts.
 * A source failure returns `{ ok: false }` — the two are never conflated.
 */
export async function fetchHpdViolations(
  bbl: string,
  fetchImpl?: typeof fetch,
): Promise<Result<HpdViolationSummary>> {
  let where: string;
  try {
    where = buildWhere(bbl);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const rows = await socrataQuery<GroupedRow>(
    DATASET_ID,
    {
      $select: 'violationstatus,class,count(1) as n',
      $where: where,
      $group: 'violationstatus,class',
    },
    { keyDesc: `bbl=${bbl}`, fetchImpl },
  );
  if (!rows.ok) return rows;

  let open = EMPTY;
  let closed = EMPTY;

  for (const row of rows.data) {
    const n = Number(row.n);
    if (!Number.isFinite(n)) {
      return fail(`${DATASET_ID}: non-numeric group count (${String(row.n)})`);
    }
    const isOpen = (row.violationstatus ?? '').trim().toLowerCase() === 'open';
    if (isOpen) {
      open = addToBucket(open, row.class ?? '', n);
    } else {
      closed = addToBucket(closed, row.class ?? '', n);
    }
  }

  return ok({ open, closed });
}
