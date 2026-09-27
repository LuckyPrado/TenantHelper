/**
 * Buildings in the current viewport, for the map's highlight layer.
 *
 * Serves two features from one query: the neutral "buildings you can look up"
 * layer while exploring, and the rent-stabilized overlay. Both need the same
 * footprints, so fetching them twice would be wasteful.
 *
 * Deliberately capped and neutral. Colouring these by how bad each building is
 * would turn browsing the city into an accusation; severity belongs in the
 * record, once you have chosen to open one.
 */

import { NextResponse } from 'next/server';
import { normalizeBbl } from '@/lib/nyc/bbl';
import { socrataQuery } from '@/lib/nyc/socrata';
import { tigerQuery } from '@/lib/tiger/client';

/** Enough to feel alive, few enough to stay under a second and light on the GPU. */
const MAX_BUILDINGS = 70;
const FOOTPRINTS = '5zhs-2jue';

interface Row {
  readonly bin?: string;
  readonly base_bbl?: string;
  readonly height_roof?: string;
  readonly the_geom?: { type: string; coordinates: unknown };
}

function num(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const bounds = ['w', 's', 'e', 'n'].map((k) => Number(params.get(k)));
  if (bounds.some((v) => !Number.isFinite(v))) {
    return NextResponse.json({ error: 'Expected w, s, e, n bounds.' }, { status: 400 });
  }
  const [west, south, east, north] = bounds;

  // Socrata's within_box takes NW then SE corners.
  const rows = await socrataQuery<Row>(
    FOOTPRINTS,
    {
      $select: 'bin,base_bbl,height_roof,the_geom',
      $where: `within_box(the_geom, ${north}, ${west}, ${south}, ${east})`,
      $limit: String(MAX_BUILDINGS),
    },
    { keyDesc: `bbox` },
  );
  if (!rows.ok) {
    return NextResponse.json({ type: 'FeatureCollection', features: [] });
  }

  const byBbl = new Map<string, Row>();
  for (const row of rows.data) {
    if (row.the_geom === undefined || row.base_bbl === undefined) continue;
    try {
      byBbl.set(normalizeBbl(row.base_bbl), row);
    } catch {
      // A footprint with an unusable lot number is not worth failing over.
    }
  }

  // One query for the whole viewport rather than one per building.
  const bbls = [...byBbl.keys()];
  let stabilized = new Set<string>();
  if (bbls.length > 0) {
    const listed = await tigerQuery<{ bbl: string }>(
      'SELECT bbl FROM stabilized WHERE bbl = ANY($1)',
      [bbls],
    );
    if (listed !== null) stabilized = new Set(listed.map((r) => r.bbl));
  }

  const features = [...byBbl].map(([bbl, row]) => ({
    type: 'Feature' as const,
    properties: {
      bbl,
      bin: row.bin ?? null,
      // Metres: NYC publishes roof heights in feet, Mapbox extrudes in metres.
      height: num(row.height_roof, 40) * 0.3048,
      stabilized: stabilized.has(bbl),
    },
    geometry: row.the_geom,
  }));

  return NextResponse.json(
    { type: 'FeatureCollection', features },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
