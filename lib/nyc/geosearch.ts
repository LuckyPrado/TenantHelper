/**
 * NYC Planning GeoSearch — address → BBL/BIN.
 *
 * No API key. This is the entry point for every other lookup in lib/nyc:
 * the whole data layer is keyed on the BBL this returns.
 *
 * `matchType` matters. GeoSearch answers "500 West 175 Street Manhattan" with
 * matchType "fallback", not "exact" — it is fuzzy, and it will happily return a
 * confident-looking result for a near miss. The UI must show `label` back to
 * the user for confirmation before presenting a report about that building.
 */

import { normalizeBbl } from './bbl';
import { fail, ok, type Result } from './result';

const GEOSEARCH_URL = 'https://geosearch.planninglabs.nyc/v2/search';
const DEFAULT_TIMEOUT_MS = 10_000;

export interface GeocodedAddress {
  readonly bbl: string;
  readonly bin: string;
  /** Canonical label, e.g. "500 WEST 175 STREET, New York, NY, USA". Show this for confirmation. */
  readonly label: string;
  readonly borough: string | null;
  readonly zip: string | null;
  /** GeoSearch's own confidence signal: "exact", "fallback", etc. */
  readonly matchType: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

interface GeoSearchFeature {
  readonly geometry?: { readonly coordinates?: readonly number[] };
  readonly properties?: {
    readonly label?: string;
    readonly borough?: string;
    readonly postalcode?: string;
    readonly match_type?: string;
    readonly addendum?: { readonly pad?: { readonly bbl?: string; readonly bin?: string } };
  };
}

/**
 * Geocode a NYC address.
 *
 * Returns a failure when the address is unknown or the result carries no BBL —
 * some GeoSearch layers (street segments, intersections) legitimately have none,
 * and a report cannot be built without one.
 */
export async function geocodeAddress(
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<GeocodedAddress>> {
  const query = address.trim();
  if (query.length === 0) return fail('Enter an address to search.');

  const url = new URL(GEOSEARCH_URL);
  url.searchParams.set('text', query);
  url.searchParams.set('size', '1');

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail(`Address lookup failed (${detail})`);
  }

  if (!response.ok) return fail(`Address lookup failed (HTTP ${response.status})`);

  let body: { features?: readonly GeoSearchFeature[] };
  try {
    body = (await response.json()) as { features?: readonly GeoSearchFeature[] };
  } catch {
    return fail('Address lookup returned an unreadable response.');
  }

  const feature = body.features?.[0];
  if (feature === undefined) return fail(`No NYC address found for ${JSON.stringify(query)}.`);

  const pad = feature.properties?.addendum?.pad;
  if (pad?.bbl === undefined || pad.bin === undefined) {
    return fail(
      `${feature.properties?.label ?? query} has no building identifier — ` +
        `try a specific street address rather than an intersection or place name.`,
    );
  }

  let bbl: string;
  try {
    bbl = normalizeBbl(pad.bbl);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const coordinates = feature.geometry?.coordinates;

  return ok({
    bbl,
    bin: pad.bin,
    label: feature.properties?.label ?? query,
    borough: feature.properties?.borough ?? null,
    zip: feature.properties?.postalcode ?? null,
    matchType: feature.properties?.match_type ?? null,
    longitude: typeof coordinates?.[0] === 'number' ? coordinates[0] : null,
    latitude: typeof coordinates?.[1] === 'number' ? coordinates[1] : null,
  });
}
