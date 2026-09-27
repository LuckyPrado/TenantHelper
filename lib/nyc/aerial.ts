/**
 * Aerial photographs of a building, via the Mapbox Static Images API.
 *
 * Real satellite imagery (Maxar), not the vector map — you can see the roof,
 * the courtyard, the scale of the block. It needs no credential beyond the
 * Mapbox token the map already uses, which is why it is this and not Street
 * View: Google's static imagery needs a separate key and a billing account.
 *
 * The building's own footprint is drawn over the photograph in the same orange
 * the 3D map uses, so the picture and the map are obviously the same building.
 */

const STATIC_BASE = 'https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static';

/** The Static Images API rejects a URL much beyond 8k, and the token is long. */
const MAX_OVERLAY_CHARS = 5500;

const HIGHLIGHT = '#ff5c1a';

export interface AerialView {
  readonly url: string;
  readonly label: string;
  /** What the viewer is looking at, for the alt text. */
  readonly alt: string;
}

interface AerialRequest {
  readonly centre: readonly [number, number];
  /** GeoJSON Polygon or MultiPolygon. Omitted when the footprint is unknown. */
  readonly geometry?: unknown;
  readonly address: string;
}

/**
 * The footprint as a Static API overlay, or null when it will not fit.
 *
 * A footprint with hundreds of vertices would push the URL past the limit and
 * the whole request would fail — better to lose the outline than the picture.
 */
function overlayFor(geometry: unknown): string | null {
  if (geometry === undefined || geometry === null) return null;

  const feature = {
    type: 'Feature',
    properties: {
      stroke: HIGHLIGHT,
      'stroke-width': 3,
      'stroke-opacity': 1,
      fill: HIGHLIGHT,
      'fill-opacity': 0.14,
    },
    geometry,
  };

  const encoded = encodeURIComponent(JSON.stringify(feature));
  return encoded.length > MAX_OVERLAY_CHARS ? null : `geojson(${encoded})`;
}

function buildUrl(
  token: string,
  overlay: string | null,
  centre: readonly [number, number],
  zoom: number,
  bearing: number,
  pitch: number,
  size: string,
): string {
  const position = `${centre[0].toFixed(6)},${centre[1].toFixed(6)},${zoom},${bearing},${pitch}`;
  const path = overlay === null ? position : `${overlay}/${position}`;
  return `${STATIC_BASE}/${path}/${size}?access_token=${encodeURIComponent(token)}`;
}

/**
 * Two views of one building: straight down, and low across the rooftops.
 *
 * Returns an empty list when there is no Mapbox token, which is the same
 * condition under which the 3D map is unavailable. A missing token must degrade
 * to no pictures, never to a broken image.
 */
export function aerialViews(request: AerialRequest, token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN): readonly AerialView[] {
  if (token === undefined || token.trim() === '') return [];

  const overlay = overlayFor(request.geometry);
  const size = '720x460@2x';

  return [
    {
      url: buildUrl(token, overlay, request.centre, 18.4, 0, 0, size),
      label: 'From above',
      alt: `Satellite photograph looking straight down at ${request.address}, with the building outlined`,
    },
    {
      url: buildUrl(token, overlay, request.centre, 18.2, -28, 60, size),
      label: 'Across the block',
      alt: `Angled aerial photograph of ${request.address} and the surrounding block`,
    },
  ];
}
