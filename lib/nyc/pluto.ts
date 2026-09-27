/**
 * PLUTO — dataset 64uk-42ks. Building characteristics.
 *
 * Supplies `unitsRes`, the denominator for the product's core metric
 * (open violations per unit). Without it there is no normalization, so a
 * missing or zero unit count is treated as a failure rather than silently
 * producing Infinity or NaN downstream.
 *
 * ⚠️ CLAUDE.md trap #2: PLUTO returns `bbl` as a float string
 * ("1021310044.00000000"), so the value coming back never matches the clean
 * form going in. Everything goes through normalizeBbl.
 */

import { normalizeBbl } from './bbl';
import { fail, ok, type Result } from './result';
import { socrataQuery } from './socrata';

export const PLUTO_DATASET = '64uk-42ks';

export interface BuildingFacts {
  readonly bbl: string;
  readonly address: string;
  /** ZIP code — the key ZORI needs for area rent. */
  readonly zipcode: string | null;
  /** Residential units — the normalization denominator. Always >= 1. */
  readonly unitsRes: number;
  readonly unitsTotal: number;
  readonly yearBuilt: number | null;
  readonly numFloors: number | null;
  readonly ownerName: string | null;
  /**
   * GROSS residential floor area in square feet — hallways, stairwells and
   * lobbies included. An apartment is smaller than this divided by the unit
   * count, and anything showing it must say so.
   */
  readonly resAreaSqFt: number | null;
}

interface PlutoRow {
  readonly bbl?: string;
  readonly address?: string;
  readonly zipcode?: string;
  readonly unitsres?: string;
  readonly unitstotal?: string;
  readonly yearbuilt?: string;
  readonly numfloors?: string;
  readonly ownername?: string;
  readonly resarea?: string;
}

/** PLUTO uses 0 for "unknown" in year fields; treat that as absent. */
function optionalNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed === 0) return null;
  return parsed;
}

/**
 * Building facts for one BBL.
 *
 * Verified for BBL 1021310044: 2308 Amsterdam Avenue, 58 residential units,
 * built 1911, 6 floors, owner MAURAY REALTY USA LLC.
 */
export async function fetchBuildingFacts(
  bbl: string,
  fetchImpl?: typeof fetch,
): Promise<Result<BuildingFacts>> {
  let normalized: string;
  try {
    normalized = normalizeBbl(bbl);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const rows = await socrataQuery<PlutoRow>(
    PLUTO_DATASET,
    {
      $select: 'bbl,address,zipcode,unitsres,unitstotal,yearbuilt,numfloors,ownername,resarea',
      bbl: normalized,
    },
    { keyDesc: `bbl=${normalized}`, fetchImpl },
  );
  if (!rows.ok) return rows;

  const row = rows.data[0];
  if (row === undefined) {
    return fail(`${PLUTO_DATASET}: no PLUTO record for BBL ${normalized}`);
  }

  const unitsRes = Number(row.unitsres);
  if (!Number.isFinite(unitsRes) || unitsRes <= 0) {
    // Guard the denominator: a per-unit rate computed from 0 is meaningless,
    // and silently rendering Infinity would be worse than saying we don't know.
    return fail(
      `${PLUTO_DATASET}: BBL ${normalized} reports ${String(row.unitsres)} residential units, ` +
        `so violations-per-unit cannot be computed`,
    );
  }

  const unitsTotal = Number(row.unitstotal);

  return ok({
    bbl: normalized,
    address: row.address?.trim() ?? '',
    zipcode: row.zipcode?.trim() || null,
    unitsRes,
    unitsTotal: Number.isFinite(unitsTotal) ? unitsTotal : unitsRes,
    yearBuilt: optionalNumber(row.yearbuilt),
    numFloors: optionalNumber(row.numfloors),
    ownerName: row.ownername?.trim() || null,
    resAreaSqFt: optionalNumber(row.resarea),
  });
}

/**
 * Average floor area per apartment, in square feet.
 *
 * Gross area over unit count, so it counts the hallway outside the door as
 * well as the rooms behind it. Useful for sanity-checking a listing's price
 * per square foot; not a measurement of any actual apartment. Null when PLUTO
 * has no residential area for the lot.
 */
export function averageUnitSqFt(facts: BuildingFacts): number | null {
  if (facts.resAreaSqFt === null || facts.unitsRes <= 0) return null;
  const average = facts.resAreaSqFt / facts.unitsRes;
  return Number.isFinite(average) && average > 0 ? average : null;
}
