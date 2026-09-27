/**
 * Tiger Data reads for the two bulk datasets.
 *
 * These replace a 10MB and a 5.2MB CSV download-and-parse per cold process.
 * Every function returns null on any problem — a missing DATABASE_URL, a
 * connection failure, an empty result — and the caller falls back to the CSV
 * path it used before. The database is an optimisation, never a dependency.
 */

import type { RentPoint } from '../nyc/zori';
import { tigerQuery } from './client';

interface ZoriRow {
  readonly month: Date;
  readonly rent: string;
}

/** Monthly rent series for one ZIP, oldest first. */
export async function readRentSeries(zip: string): Promise<readonly RentPoint[] | null> {
  const rows = await tigerQuery<ZoriRow>(
    'SELECT month, rent FROM zori WHERE zip = $1 ORDER BY month ASC',
    [zip],
  );
  if (rows === null || rows.length === 0) return null;

  const points: RentPoint[] = [];
  for (const row of rows) {
    const rent = Number(row.rent);
    if (!Number.isFinite(rent)) continue;
    // Match the CSV's yyyy-mm-dd month labels exactly, so downstream
    // formatting and tests do not have to care which source answered.
    points.push({ month: row.month.toISOString().slice(0, 10), rent });
  }
  return points.length > 0 ? points : null;
}

interface StabilizedRow {
  readonly building_class: string | null;
}

export interface StabilizedLookup {
  readonly isStabilized: boolean;
  readonly buildingClass: string | null;
}

/**
 * Whether a BBL is on the stabilized list.
 *
 * Distinguishes "not listed" (a real answer) from "could not ask" (null), so a
 * database outage never reads as a building being unregulated.
 */
export async function readStabilization(bbl: string): Promise<StabilizedLookup | null> {
  const rows = await tigerQuery<StabilizedRow>(
    'SELECT building_class FROM stabilized WHERE bbl = $1',
    [bbl],
  );
  if (rows === null) return null;

  if (rows.length === 0) return { isStabilized: false, buildingClass: null };
  return { isStabilized: true, buildingClass: rows[0].building_class };
}

export interface YearlyRent {
  readonly year: string;
  readonly avgRent: number;
  readonly minRent: number;
  readonly maxRent: number;
}

interface YearlyRow {
  readonly year: Date;
  readonly avg_rent: string;
  readonly min_rent: string;
  readonly max_rent: string;
}

/**
 * Yearly rent summary from the continuous aggregate.
 *
 * Precomputed and refreshed on a schedule rather than averaged per request.
 */
export async function readYearlyRent(zip: string): Promise<readonly YearlyRent[] | null> {
  const rows = await tigerQuery<YearlyRow>(
    'SELECT year, avg_rent, min_rent, max_rent FROM zori_yearly WHERE zip = $1 ORDER BY year ASC',
    [zip],
  );
  if (rows === null || rows.length === 0) return null;

  return rows.map((row) => ({
    year: row.year.toISOString().slice(0, 4),
    avgRent: Number(row.avg_rent),
    minRent: Number(row.min_rent),
    maxRent: Number(row.max_rent),
  }));
}
