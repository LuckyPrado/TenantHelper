/**
 * Shared Socrata (NYC Open Data) client.
 *
 * SERVER ONLY. Reads SOCRATA_APP_TOKEN from the environment and sends it as
 * X-App-Token. Never import this from a client component — the token must not
 * reach the browser.
 *
 * Unauthenticated requests work but are throttled, which is exactly the failure
 * you do not want during a demo, so the token is sent whenever it is present.
 */

import { fail, ok, type Result } from './result';

const SOCRATA_BASE = 'https://data.cityofnewyork.us/resource';
const DEFAULT_TIMEOUT_MS = 10_000;

/** Socrata returns aggregate counts as strings under this key. */
const COUNT_KEY = 'count_1';

export type SoqlParams = Readonly<Record<string, string>>;

export interface SocrataOptions {
  /** Short human label for the lookup key, used in logs. e.g. "bbl=1021310044" */
  readonly keyDesc: string;
  readonly timeoutMs?: number;
  /** Injectable for tests. Defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
}

function buildUrl(datasetId: string, params: SoqlParams): string {
  const url = new URL(`${SOCRATA_BASE}/${datasetId}.json`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function appToken(): string | undefined {
  const raw = process.env.SOCRATA_APP_TOKEN;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Socrata signals some failures with HTTP 200 and an error object body,
 * e.g. the auth-gated HPD Complaints dataset. Treat that as a failure.
 */
function isSocrataErrorBody(body: unknown): body is { message?: string } {
  return typeof body === 'object' && body !== null && 'error' in body &&
    (body as { error?: unknown }).error === true;
}

/**
 * Run a SoQL query and return the raw rows.
 *
 * Any non-2xx, network error, timeout, malformed body, or Socrata error object
 * becomes `{ ok: false }`. Callers can therefore never confuse "the source is
 * down" with "this building is clean".
 */
export async function socrataQuery<TRow>(
  datasetId: string,
  params: SoqlParams,
  options: SocrataOptions,
): Promise<Result<readonly TRow[]>> {
  const { keyDesc, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = options;
  const url = buildUrl(datasetId, params);
  const token = appToken();
  const startedAt = Date.now();

  const send = (withToken: boolean): Promise<Response> =>
    fetchImpl(url, {
      headers: withToken && token ? { 'X-App-Token': token } : {},
      signal: AbortSignal.timeout(timeoutMs),
    });

  let response: Response;
  try {
    response = await send(true);

    // A rejected app token returns 403 while the SAME request unauthenticated
    // returns 200. Rather than let a mistyped token take the whole app down,
    // retry once without it and make the misconfiguration loud instead of fatal.
    if (response.status === 403 && token !== undefined) {
      warnOnceAboutBadToken();
      response = await send(false);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logCall(datasetId, keyDesc, startedAt, `network error: ${detail}`);
    return fail(`${datasetId}: request failed (${detail})`);
  }

  if (!response.ok) {
    logCall(datasetId, keyDesc, startedAt, `HTTP ${response.status}`);
    return fail(`${datasetId}: HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    logCall(datasetId, keyDesc, startedAt, 'unparseable body');
    return fail(`${datasetId}: response was not valid JSON`);
  }

  if (isSocrataErrorBody(body)) {
    const detail = body.message ?? 'unknown Socrata error';
    logCall(datasetId, keyDesc, startedAt, `socrata error: ${detail}`);
    return fail(`${datasetId}: ${detail}`);
  }

  if (!Array.isArray(body)) {
    logCall(datasetId, keyDesc, startedAt, 'unexpected shape');
    return fail(`${datasetId}: expected an array of rows`);
  }

  logCall(datasetId, keyDesc, startedAt, `${body.length} rows`);
  return ok(body as readonly TRow[]);
}

/**
 * Count rows matching a SoQL `$where`.
 *
 * A successful query that matches nothing is a genuine 0 and returns ok(0).
 * A failure returns `{ ok: false }` — see result.ts for why that distinction
 * is load-bearing here.
 */
export async function socrataCount(
  datasetId: string,
  where: string,
  options: SocrataOptions,
): Promise<Result<number>> {
  const rows = await socrataQuery<Record<string, string>>(
    datasetId,
    { $select: `count(1)`, $where: where },
    options,
  );
  if (!rows.ok) return rows;

  if (rows.data.length === 0) return ok(0);

  const raw = rows.data[0]?.[COUNT_KEY];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fail(`${datasetId}: count was not numeric (${String(raw)})`);
  }
  return ok(parsed);
}

/** Escape a value for use inside a single-quoted SoQL string literal. */
export function soqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function logCall(datasetId: string, keyDesc: string, startedAt: number, outcome: string): void {
  const ms = Date.now() - startedAt;
  console.info(`[nyc] ${datasetId} ${keyDesc} ${ms}ms — ${outcome}`);
}

let warnedAboutToken = false;

/** Warn once per process, not once per request — six fetchers fire per report. */
function warnOnceAboutBadToken(): void {
  if (warnedAboutToken) return;
  warnedAboutToken = true;
  console.warn(
    '[nyc] SOCRATA_APP_TOKEN was rejected (403 "Invalid app_token"). ' +
      'Falling back to unauthenticated requests, which WILL be throttled under load. ' +
      'Fix: data.cityofnewyork.us → profile → Developer Settings → copy the "App Token" ' +
      '(not the Secret Token), created on that portal.',
  );
}

/** Test seam: reset the once-per-process warning latch. */
export function resetTokenWarningForTests(): void {
  warnedAboutToken = false;
}
