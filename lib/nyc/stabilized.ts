/**
 * Rent stabilization status, from the firstmovernyc community dataset.
 *
 * NYC Open Data publishes no rent stabilization list, so this is a
 * community-maintained CSV built from Rent Guidelines Board filings. Treat it
 * as a strong signal, never as legal fact — the repo is an unlicensed hobby
 * project that self-describes as possibly containing errors. The UI must say so.
 *
 * ⚠️ CLAUDE.md trap #5: the file is stored with Git LFS, so
 * raw.githubusercontent.com returns a pointer file rather than data. The
 * media.githubusercontent.com host below serves the real bytes.
 */

import { normalizeBbl } from './bbl';
import { fail, ok, type Result } from './result';
import { splitCsvLine } from './zori';

const CSV_URL =
  'https://media.githubusercontent.com/media/firstmovernyc/nyc-rent-stabilized-listings/main/5_coordinates_complete/listing_with_coordinates_complete.csv';

export const SOURCE_REPO_URL = 'https://github.com/firstmovernyc/nyc-rent-stabilized-listings';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Borough name as spelled in the CSV -> BBL borough digit. */
const BOROUGH_CODES: Readonly<Record<string, string>> = {
  manhattan: '1',
  bronx: '2',
  brooklyn: '3',
  queens: '4',
  'staten island': '5',
};

export interface StabilizationStatus {
  readonly bbl: string;
  readonly isStabilized: boolean;
  /** e.g. "MULTIPLE DWELLING A". Empty for every Queens row in the source data. */
  readonly buildingClass: string | null;
}

/**
 * Build a BBL from the CSV's separate borough/block/lot columns.
 * Block pads to 5 digits, lot to 4 — the inverse of decomposeBbl.
 */
export function rowToBbl(borough: string, block: string, lot: string): string | null {
  const boroid = BOROUGH_CODES[borough.trim().toLowerCase()];
  if (boroid === undefined) return null;

  const blockNum = Number(block);
  const lotNum = Number(lot);
  if (!Number.isInteger(blockNum) || !Number.isInteger(lotNum)) return null;
  if (blockNum <= 0 || lotNum <= 0) return null;
  if (blockNum > 99999 || lotNum > 9999) return null;

  return `${boroid}${String(blockNum).padStart(5, '0')}${String(lotNum).padStart(4, '0')}`;
}

export function parseStabilizedCsv(csv: string): ReadonlyMap<string, string | null> {
  const lines = csv.split('\n');
  const header = splitCsvLine(lines[0] ?? '').map((h) => h.trim().toUpperCase());
  const iBorough = header.indexOf('BOROUGH');
  const iBlock = header.indexOf('BLOCK');
  const iLot = header.indexOf('LOT');
  const iStatus = header.indexOf('STATUS1');
  if (iBorough < 0 || iBlock < 0 || iLot < 0) return new Map();

  const byBbl = new Map<string, string | null>();
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') continue;

    const fields = splitCsvLine(line);
    const bbl = rowToBbl(fields[iBorough] ?? '', fields[iBlock] ?? '', fields[iLot] ?? '');
    if (bbl === null) continue;

    const status = iStatus >= 0 ? (fields[iStatus] ?? '').trim() : '';
    // First row wins; a lot can appear more than once across address ranges.
    if (!byBbl.has(bbl)) byBbl.set(bbl, status === '' ? null : status);
  }
  return byBbl;
}

interface Cache {
  readonly byBbl: ReadonlyMap<string, string | null>;
  readonly loadedAt: number;
}

let cache: Cache | null = null;
let inFlight: Promise<Result<ReadonlyMap<string, string | null>>> | null = null;

/** Test seam: drop the in-memory cache. */
export function resetStabilizedCacheForTests(): void {
  cache = null;
  inFlight = null;
}

async function loadStabilized(
  fetchImpl: typeof fetch,
): Promise<Result<ReadonlyMap<string, string | null>>> {
  if (cache !== null && Date.now() - cache.loadedAt < CACHE_TTL_MS) return ok(cache.byBbl);
  if (inFlight !== null) return inFlight;

  inFlight = (async () => {
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(CSV_URL, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) return fail(`Stabilized list: HTTP ${response.status}`);

      const text = await response.text();
      // A Git LFS pointer is a small text stub, not the data. Catch it explicitly
      // rather than silently reporting every building as unstabilized.
      if (text.startsWith('version https://git-lfs')) {
        return fail('Stabilized list: got a Git LFS pointer instead of the CSV.');
      }

      const byBbl = parseStabilizedCsv(text);
      if (byBbl.size === 0) return fail('Stabilized list: no rows parsed — format may have changed');

      cache = { byBbl, loadedAt: Date.now() };
      console.info(`[nyc] stabilized list loaded ${byBbl.size} BBLs in ${Date.now() - startedAt}ms`);
      return ok(byBbl);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return fail(`Stabilized list: request failed (${detail})`);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Whether a building appears on the rent stabilized list.
 *
 * Absence is reported as `isStabilized: false`, which is a real answer rather
 * than a failure — but it means "not on this list", not "definitely not
 * stabilized". A source failure still returns `{ ok: false }`.
 */
export async function fetchStabilizationStatus(
  bbl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<StabilizationStatus>> {
  let normalized: string;
  try {
    normalized = normalizeBbl(bbl);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const loaded = await loadStabilized(fetchImpl);
  if (!loaded.ok) return loaded;

  const isStabilized = loaded.data.has(normalized);
  return ok({
    bbl: normalized,
    isStabilized,
    buildingClass: isStabilized ? (loaded.data.get(normalized) ?? null) : null,
  });
}
