/**
 * Zillow Observed Rent Index (ZORI) — area rent and trend, keyed by ZIP.
 *
 * Market rent does not exist anywhere in NYC Open Data (see CLAUDE.md), so this
 * is the only rent signal available without a key. It is ZIP-level, so it is
 * ALWAYS "area rent" — never present it as this building's rent.
 *
 * The file is ~10MB, so it is fetched once per server process, reduced to NYC
 * ZIPs, and cached in memory. Next's fetch cache is not used: the response is
 * far larger than its default entry limit.
 */

import { fail, ok, type Result } from './result';

const ZORI_URL =
  'https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FIRST_DATE_COLUMN = 9;
const MONTHS_OF_HISTORY = 60;
const NYC_ZIP = /^1[01]\d{3}$/;

export interface RentPoint {
  readonly month: string;
  readonly rent: number;
}

export interface AreaRent {
  readonly zip: string;
  readonly latest: RentPoint;
  /** Trailing history for charting, oldest first. */
  readonly series: readonly RentPoint[];
  /** Change over the trailing 12 months, as a percentage. Null if history is too short. */
  readonly yearOverYearPct: number | null;
  /** Naive 12-month extrapolation of that same rate. Null when YoY is null. */
  readonly projectedNextYear: number | null;
  /** Printed beside the projection so the arithmetic is never a black box. */
  readonly method: string;
}

/**
 * Split one CSV line, honouring double-quoted fields.
 *
 * Required, not decorative: ZORI's Metro column is quoted and contains a comma
 * ("New York-Newark-Jersey City, NY-NJ-PA"), so a naive split misaligns every
 * column after it and silently reads rent from the wrong month.
 */
export function splitCsvLine(line: string): readonly string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/** zip -> full monthly series, oldest first. Empty cells are skipped, not zeroed. */
export function parseZoriCsv(csv: string): ReadonlyMap<string, readonly RentPoint[]> {
  const lines = csv.split('\n');
  const header = splitCsvLine(lines[0] ?? '');
  const months = header.slice(FIRST_DATE_COLUMN);
  const byZip = new Map<string, readonly RentPoint[]>();

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') continue;

    const fields = splitCsvLine(line);
    const zip = fields[2] ?? '';
    if (!NYC_ZIP.test(zip)) continue;

    const points: RentPoint[] = [];
    for (let m = 0; m < months.length; m += 1) {
      const raw = fields[FIRST_DATE_COLUMN + m];
      if (raw === undefined || raw === '') continue;
      const rent = Number(raw);
      if (!Number.isFinite(rent)) continue;
      points.push({ month: months[m], rent });
    }
    if (points.length > 0) byZip.set(zip, points);
  }

  return byZip;
}

interface Cache {
  readonly byZip: ReadonlyMap<string, readonly RentPoint[]>;
  readonly loadedAt: number;
}

let cache: Cache | null = null;
let inFlight: Promise<Result<ReadonlyMap<string, readonly RentPoint[]>>> | null = null;

/** Test seam: drop the in-memory cache. */
export function resetZoriCacheForTests(): void {
  cache = null;
  inFlight = null;
}

async function loadZori(
  fetchImpl: typeof fetch,
): Promise<Result<ReadonlyMap<string, readonly RentPoint[]>>> {
  if (cache !== null && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return ok(cache.byZip);
  }
  // Six concurrent report renders must not each pull 10MB.
  if (inFlight !== null) return inFlight;

  inFlight = (async () => {
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(ZORI_URL, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) return fail(`ZORI: HTTP ${response.status}`);

      const byZip = parseZoriCsv(await response.text());
      if (byZip.size === 0) return fail('ZORI: no NYC ZIP rows found — the file format may have changed');

      cache = { byZip, loadedAt: Date.now() };
      console.info(`[nyc] zori loaded ${byZip.size} NYC ZIPs in ${Date.now() - startedAt}ms`);
      return ok(byZip);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return fail(`ZORI: request failed (${detail})`);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

function summarise(zip: string, points: readonly RentPoint[]): AreaRent {
  const latest = points[points.length - 1];
  const yearAgo = points.length >= 13 ? points[points.length - 13] : undefined;

  const yearOverYearPct =
    yearAgo !== undefined && yearAgo.rent > 0
      ? ((latest.rent - yearAgo.rent) / yearAgo.rent) * 100
      : null;

  return {
    zip,
    latest,
    series: points.slice(-MONTHS_OF_HISTORY),
    yearOverYearPct,
    projectedNextYear:
      yearOverYearPct === null ? null : latest.rent * (1 + yearOverYearPct / 100),
    method:
      yearOverYearPct === null
        ? 'Not enough history in the Zillow Observed Rent Index for this ZIP.'
        : `Zillow Observed Rent Index for ZIP ${zip}, ${points.length} months of data. ` +
          `Projection carries the trailing 12-month change (${yearOverYearPct.toFixed(1)}%) ` +
          `forward one year. It is straight-line arithmetic, not a model.`,
  };
}

/** Area rent and trend for one ZIP. */
export async function fetchAreaRent(
  zip: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<AreaRent>> {
  const trimmed = zip.trim();
  if (!NYC_ZIP.test(trimmed)) return fail(`${zip} is not a NYC ZIP code.`);

  const loaded = await loadZori(fetchImpl);
  if (!loaded.ok) return loaded;

  const points = loaded.data.get(trimmed);
  if (points === undefined || points.length === 0) {
    return fail(`Zillow publishes no rent index for ZIP ${trimmed}.`);
  }

  return ok(summarise(trimmed, points));
}
