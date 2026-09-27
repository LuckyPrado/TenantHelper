/**
 * Deciding where to put the camera, as arithmetic rather than as constants.
 *
 * Both functions here exist because a single tuned number was wrong. The
 * first version of the focus camera used a fixed zoom, picked while looking at
 * a five-storey walk-up; pointed at a 301ft tower in Chelsea it framed the
 * lobby and cut the rest off. The second used a bearing chooser that scored
 * only neighbours taller than the subject, so for a building that is itself
 * one of the tallest around, every sector tied at zero and the tie fell
 * through to sector zero — swinging the camera to an arbitrary side.
 *
 * Kept separate from the map component so both can be tested without a WebGL
 * context.
 */

/** Compass sectors the surroundings are bucketed into. 30 degrees each. */
export const SECTORS = 12;
const SECTOR_DEG = 360 / SECTORS;

/** Equatorial metres per pixel at zoom 0, the constant in the Mapbox scale. */
const EQUATOR_M_PER_PX = 156_543.03392;

/** Zoom is clamped: past these the view is either a roof or a neighbourhood. */
export const MIN_FOCUS_ZOOM = 15.8;

export const MAX_FOCUS_ZOOM = 18.6;

/** Pixels a span of `metres` covers at this zoom. The inverse of the above. */
export function pixelsForMetres(metres: number, zoom: number, latitude: number): number {
  const cosLat = Math.cos((latitude * Math.PI) / 180);
  const metresPerPixel = (EQUATOR_M_PER_PX * cosLat) / 2 ** zoom;
  return metres / metresPerPixel;
}

/**
 * Where the building's ground point sits, as a share of viewport height.
 *
 * Not the middle of the band: a building is drawn upward from its footprint,
 * so its base belongs near the bottom of the clear strip with the height
 * rising into the space above. Centring the base sent towers off the top.
 */
const GROUND_POINT = 0.34;

/**
 * The share of the viewport's HEIGHT the building should occupy.
 *
 * Not the short side, and not the whole frame: the record covers the lower
 * two thirds of the screen and the camera lifts the building above it, so the
 * building really has a band across the top to live in. Framing against the
 * full viewport was the first attempt and it barely moved the zoom at all,
 * because a tower still "fitted" in space the panel was covering.
 */
const TARGET_FILL = 0.26;

/**
 * How much screen a metre of height costs, relative to a metre of plan.
 *
 * Calibrated against a render, not derived: a vertical edge at pitch 52 should
 * project to sin(52) of its length, but perspective magnifies whatever is
 * nearest the camera, and 500 W 18 St measured about twice the naive estimate
 * and ran off the top of the frame. Two is the measured figure with a little
 * margin, and the margin is cheap — a slightly small building is readable, a
 * decapitated one is not.
 */
export const HEIGHT_WEIGHT = 2;

export interface BuildingSize {
  /** Longest span across the footprint, in metres. */
  readonly extentM: number;
  /** Roof height in metres. */
  readonly heightM: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * Longest distance between any two vertices of the footprint, in metres.
 *
 * Sampled rather than exhaustive: an O(n²) pass over a footprint with hundreds
 * of vertices runs on every report, and the widest span of a building is not
 * a figure that needs to be exact to the metre.
 */
export function footprintExtentMetres(
  geometry: unknown,
  latitude: number,
): number {
  const points: number[][] = [];
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      points.push(node as number[]);
      return;
    }
    for (const child of node) walk(child);
  };
  walk((geometry as { coordinates?: unknown } | null)?.coordinates);
  if (points.length < 2) return 0;

  const MAX_SAMPLES = 64;
  const stride = Math.max(1, Math.ceil(points.length / MAX_SAMPLES));
  const sample = points.filter((_, index) => index % stride === 0);

  const cosLat = Math.cos((latitude * Math.PI) / 180);
  const mPerDegLat = 111_320;

  let widest = 0;
  for (let i = 0; i < sample.length; i += 1) {
    for (let j = i + 1; j < sample.length; j += 1) {
      const dx = (sample[j][0] - sample[i][0]) * cosLat * mPerDegLat;
      const dy = (sample[j][1] - sample[i][1]) * mPerDegLat;
      const distance = Math.hypot(dx, dy);
      if (distance > widest) widest = distance;
    }
  }
  return widest;
}

/**
 * The zoom at which this building fills a useful share of the frame.
 *
 * Derived from the building's own dimensions rather than fixed, because the
 * range is enormous: a walk-up is 15 metres across and 18 tall, a Chelsea
 * tower is 90 across and 92 tall, and no single zoom frames both.
 */
export function zoomForBuilding(
  size: BuildingSize,
  viewportHeightPx: number,
  latitude: number,
): number {
  const span = Math.max(size.extentM, size.heightM * HEIGHT_WEIGHT, 1);
  const targetPx = Math.max(viewportHeightPx * TARGET_FILL, 1);
  const metresPerPixel = span / targetPx;

  const cosLat = Math.cos((latitude * Math.PI) / 180);
  const zoom = Math.log2((EQUATOR_M_PER_PX * cosLat) / metresPerPixel);

  return clamp(Number(zoom.toFixed(2)), MIN_FOCUS_ZOOM, MAX_FOCUS_ZOOM);
}

/** The sector the camera occupies when the map is at this bearing. */
export function cameraSectorFor(bearing: number): number {
  const cameraDirection = (((bearing + 180) % 360) + 360) % 360;
  return Math.floor(cameraDirection / SECTOR_DEG) % SECTORS;
}

/** The bearing that places the camera in the middle of a sector. */
export function bearingForSector(sector: number): number {
  const cameraDirection = sector * SECTOR_DEG + SECTOR_DEG / 2;
  const bearing = (cameraDirection + 180) % 360;
  return bearing > 180 ? bearing - 360 : bearing;
}

/** Smallest angle between two bearings, in degrees. */
export function angleBetween(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

/** Scores within this of the best count as equally clear. */
const TIE_EPSILON = 0.05;
/** Below this improvement, moving the camera is not worth the motion. */
const WORTHWHILE_GAIN = 0.15;

/**
 * Which way to face, given how blocked each sector is.
 *
 * `scores` is indexed by sector: higher means more obstructed. Returns null
 * when the camera should stay where it is, which is the answer whenever the
 * default view is already as clear as anything else — the previous version had
 * no such case, so a flat set of scores always produced a swing to sector
 * zero, and the camera spun to an arbitrary side of the building.
 *
 * Among sectors that are genuinely clearer, the one requiring the smallest
 * turn wins, so the camera never travels further than the view improves.
 */
export function chooseCameraBearing(
  scores: readonly number[],
  defaultBearing: number,
): number | null {
  if (scores.length !== SECTORS) return null;

  const best = Math.min(...scores);
  const current = scores[cameraSectorFor(defaultBearing)];
  if (current <= best + WORTHWHILE_GAIN) return null;

  let chosen: number | null = null;
  let smallestTurn = Infinity;

  for (let sector = 0; sector < SECTORS; sector += 1) {
    if (scores[sector] > best + TIE_EPSILON) continue;
    const bearing = bearingForSector(sector);
    const turn = angleBetween(bearing, defaultBearing);
    if (turn < smallestTurn) {
      smallestTurn = turn;
      chosen = bearing;
    }
  }

  return chosen;
}

/**
 * How far to lift the camera target above centre, in pixels.
 *
 * Positive is down the screen, so this returns a negative number, matching
 * Mapbox's `offset`. Scales with the viewport instead of being a constant,
 * because a fixed 200px is a third of a phone screen and a fifth of a desktop
 * one.
 */
export function focusOffsetY(viewportHeightPx: number): number {
  return Math.round(viewportHeightPx * GROUND_POINT - viewportHeightPx / 2);
}
