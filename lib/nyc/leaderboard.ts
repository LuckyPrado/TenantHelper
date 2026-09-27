/**
 * Best and worst buildings in a ZIP, by open violations per apartment.
 *
 * A genuine "best" list needs the buildings that have NO violations, and those
 * never appear in the violations dataset. So the ranking starts from PLUTO's
 * full residential stock for the ZIP and joins the violation counts onto it —
 * a building absent from the violation data scores a real zero.
 */

import { normalizeBbl } from './bbl';
import { fail, ok, type Result } from './result';
import { socrataQuery, soqlString } from './socrata';

const VIOLATIONS_DATASET = 'wvxf-dwi5';
const PLUTO_DATASET = '64uk-42ks';

/** Below this, per-unit rates swing wildly on one violation. */
const MIN_UNITS = 6;
const MAX_BUILDINGS = 5000;
const LIST_SIZE = 10;
/** Lots at or above this are condo billing lots, not physical buildings. */
const CONDO_LOT_THRESHOLD = 7500;

export interface LeaderboardEntry {
  readonly bbl: string;
  readonly address: string;
  readonly unitsRes: number;
  readonly openViolations: number;
  readonly openPerUnit: number;
}

export interface Leaderboard {
  readonly zip: string;
  readonly buildingsRanked: number;
  readonly totalOpenViolations: number;
  readonly medianPerUnit: number;
  readonly worst: readonly LeaderboardEntry[];
  readonly best: readonly LeaderboardEntry[];
}

interface PlutoRow {
  readonly bbl?: string;
  readonly address?: string;
  readonly unitsres?: string;
}

interface ViolationRow {
  readonly boroid?: string;
  readonly block?: string;
  readonly lot?: string;
  readonly n?: string;
}

function violationRowToBbl(row: ViolationRow): string | null {
  const boroid = row.boroid?.trim();
  const block = Number(row.block);
  const lot = Number(row.lot);
  if (boroid === undefined || !Number.isInteger(block) || !Number.isInteger(lot)) return null;
  if (lot >= CONDO_LOT_THRESHOLD) return null;
  try {
    return normalizeBbl(`${boroid}${String(block).padStart(5, '0')}${String(lot).padStart(4, '0')}`);
  } catch {
    return null;
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function fetchLeaderboard(
  zip: string,
  fetchImpl?: typeof fetch,
): Promise<Result<Leaderboard>> {
  const trimmed = zip.trim();
  if (!/^1[01]\d{3}$/.test(trimmed)) return fail(`${zip} is not a NYC ZIP code.`);

  const [buildings, violations] = await Promise.all([
    socrataQuery<PlutoRow>(
      PLUTO_DATASET,
      {
        $select: 'bbl,address,unitsres',
        $where: `zipcode=${soqlString(trimmed)} AND unitsres>=${MIN_UNITS}`,
        $limit: String(MAX_BUILDINGS),
      },
      { keyDesc: `zip=${trimmed}`, fetchImpl },
    ),
    socrataQuery<ViolationRow>(
      VIOLATIONS_DATASET,
      {
        $select: 'boroid,block,lot,count(1) as n',
        $where: `zip=${soqlString(trimmed)} AND violationstatus='Open'`,
        $group: 'boroid,block,lot',
        $limit: String(MAX_BUILDINGS),
      },
      { keyDesc: `zip=${trimmed}`, fetchImpl },
    ),
  ]);

  if (!buildings.ok) return buildings;
  if (!violations.ok) return violations;

  const openByBbl = new Map<string, number>();
  for (const row of violations.data) {
    const bbl = violationRowToBbl(row);
    const n = Number(row.n);
    if (bbl === null || !Number.isFinite(n)) continue;
    openByBbl.set(bbl, (openByBbl.get(bbl) ?? 0) + n);
  }

  const entries: LeaderboardEntry[] = [];
  for (const row of buildings.data) {
    const units = Number(row.unitsres);
    if (!Number.isFinite(units) || units < MIN_UNITS) continue;

    let bbl: string;
    try {
      bbl = normalizeBbl(row.bbl ?? '');
    } catch {
      continue;
    }

    const openViolations = openByBbl.get(bbl) ?? 0;
    entries.push({
      bbl,
      address: row.address?.trim() ?? '',
      unitsRes: units,
      openViolations,
      openPerUnit: openViolations / units,
    });
  }

  if (entries.length === 0) {
    return fail(`No residential buildings of ${MIN_UNITS}+ units found in ${trimmed}.`);
  }

  const worst = [...entries].sort((a, b) => b.openPerUnit - a.openPerUnit).slice(0, LIST_SIZE);
  // Among clean buildings, prefer the larger ones — a 500-unit building with a
  // spotless record says far more than a 6-unit one.
  const best = [...entries]
    .sort((a, b) => a.openPerUnit - b.openPerUnit || b.unitsRes - a.unitsRes)
    .slice(0, LIST_SIZE);

  return ok({
    zip: trimmed,
    buildingsRanked: entries.length,
    totalOpenViolations: entries.reduce((sum, e) => sum + e.openViolations, 0),
    medianPerUnit: median(entries.map((e) => e.openPerUnit)),
    worst,
    best,
  });
}
