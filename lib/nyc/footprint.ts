/**
 * Building footprints — dataset 5zhs-2jue (DOITT).
 *
 * The map needs the actual outline of the building, not just a pin. With the
 * footprint the selected building can be highlighted from any camera angle,
 * which is the whole point of showing it in 3D.
 *
 * Keyed by BIN, like DOB violations: BIN identifies a physical building, while
 * BBL is a tax lot that may hold several.
 *
 * ⚠️ The field names are snake_case (`height_roof`, `ground_elevation`), not the
 * upper-case forms the NYC data dictionary lists.
 */

import { fail, ok, type Result } from './result';
import { socrataQuery, soqlString } from './socrata';

export const FOOTPRINT_DATASET = '5zhs-2jue';

const BIN_PATTERN = /^[1-5]\d{6}$/;

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

  const row = rows.data[0];
  if (row?.the_geom === undefined) {
    return fail(`No building footprint on file for BIN ${trimmed}.`);
  }

  const centre = centreOf(row.the_geom);
  if (centre === null) return fail(`Footprint for BIN ${trimmed} has no usable coordinates.`);

  return ok({
    bin: trimmed,
    geometry: row.the_geom,
    heightFt: optionalNumber(row.height_roof),
    constructionYear: optionalNumber(row.construction_year),
    centre,
  });
}
