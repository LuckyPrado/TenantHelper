/**
 * Building footprints — dataset 5zhs-2jue (DOITT).
 *
 * The map needs the actual outline of the building, not just a pin. With the
 * footprint the selected building can be highlighted from any camera angle,
 * which is the whole point of showing it in 3D.
 *
 * Keyed by BIN, like DOB violations: BIN identifies a physical building, while
 * BBL is a tax lot that may hold several. Rows also carry `base_bbl`, which is
 * the fallback when geosearch gives us a lot but no building number.
 *
 * ⚠️ The field names are snake_case (`height_roof`, `ground_elevation`), not the
 * upper-case forms the NYC data dictionary lists.
 */

import { fail, ok, type Result } from './result';
import { socrataQuery, soqlString } from './socrata';

export const FOOTPRINT_DATASET = '5zhs-2jue';

const BIN_PATTERN = /^[1-5]\d{6}$/;
const BBL_PATTERN = /^[1-5]\d{9}$/;

/** A GeoJSON Polygon or MultiPolygon, as Socrata returns it. */
export interface FootprintGeometry {
  readonly type: 'Polygon' | 'MultiPolygon';
  readonly coordinates: unknown;
}

export interface Footprint {
  readonly bin: string;
  readonly geometry: FootprintGeometry;
  /** Roof height in feet above ground. Null when the source omits it. */
  readonly heightFt: number | null;
  readonly constructionYear: number | null;
  /** Rough centre of the outline, for the camera to fly to. */
  readonly centre: readonly [number, number];
}

interface FootprintRow {
  readonly bin?: string;
  readonly base_bbl?: string;
  readonly the_geom?: FootprintGeometry;
  readonly height_roof?: string;
  readonly construction_year?: string;
}

/**
 * Average every vertex. Not a true centroid, but the outline of one building is
 * small and convex enough that the difference is metres — and the camera only
 * needs somewhere sensible to point.
 */
function centreOf(geometry: FootprintGeometry): readonly [number, number] | null {
  const points: number[][] = [];

  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      points.push(node as number[]);
      return;
    }
    for (const child of node) walk(child);
  };
  walk(geometry.coordinates);

  if (points.length === 0) return null;
  const sum = points.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length] as const;
}

function optionalNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Turn a row into a Footprint, or say why it cannot be one. */
function toFootprint(row: FootprintRow | undefined, keyDesc: string): Result<Footprint> {
  if (row?.the_geom === undefined) {
    return fail(`No building footprint on file for ${keyDesc}.`);
  }

  const centre = centreOf(row.the_geom);
  if (centre === null) return fail(`Footprint for ${keyDesc} has no usable coordinates.`);

  return ok({
    bin: row.bin ?? '',
    geometry: row.the_geom,
    heightFt: optionalNumber(row.height_roof),
    constructionYear: optionalNumber(row.construction_year),
    centre,
  });
}

/** The outline of one building. Verified 217 bytes for a typical walk-up. */
export async function fetchFootprint(
  bin: string,
  fetchImpl?: typeof fetch,
): Promise<Result<Footprint>> {
  const trimmed = bin.trim();
  if (!BIN_PATTERN.test(trimmed)) {
    return fail(`Invalid BIN ${JSON.stringify(bin)}: expected 7 digits starting 1-5`);
  }

  const rows = await socrataQuery<FootprintRow>(
    FOOTPRINT_DATASET,
    {
      $select: 'bin,the_geom,height_roof,construction_year',
      $where: `bin=${soqlString(trimmed)}`,
      $limit: '1',
    },
    { keyDesc: `bin=${trimmed}`, fetchImpl },
  );
  if (!rows.ok) return rows;

  return toFootprint(rows.data[0], `BIN ${trimmed}`);
}

/**
 * The outline of the main building on a tax lot.
 *
 * Geosearch does not always return a BIN, and without one the camera has
 * nowhere to fly — the record then renders over whatever part of the city the
 * map happened to be showing, which looks broken rather than degraded. A lot
 * can hold several buildings, so this takes the tallest, which for a residential
 * address is the one the report is about.
 *
 * The tallest is chosen here rather than with `$order`, because Socrata returns
 * `height_roof` as a string and a text-typed column would sort it lexically —
 * "9.5" above "100.2", quietly picking the wrong building.
 */
export async function fetchFootprintByBbl(
  bbl: string,
  fetchImpl?: typeof fetch,
): Promise<Result<Footprint>> {
  const trimmed = bbl.trim();
  if (!BBL_PATTERN.test(trimmed)) {
    return fail(`Invalid BBL ${JSON.stringify(bbl)}: expected 10 digits starting 1-5`);
  }

  const rows = await socrataQuery<FootprintRow>(
    FOOTPRINT_DATASET,
    {
      $select: 'bin,base_bbl,the_geom,height_roof,construction_year',
      $where: `base_bbl=${soqlString(trimmed)}`,
      $limit: '10',
    },
    { keyDesc: `base_bbl=${trimmed}`, fetchImpl },
  );
  if (!rows.ok) return rows;

  const tallest = rows.data.reduce<FootprintRow | undefined>((best, row) => {
    if (row.the_geom === undefined) return best;
    if (best === undefined) return row;
    return (optionalNumber(row.height_roof) ?? 0) > (optionalNumber(best.height_roof) ?? 0)
      ? row
      : best;
  }, undefined);

  return toFootprint(tallest, `BBL ${trimmed}`);
}
