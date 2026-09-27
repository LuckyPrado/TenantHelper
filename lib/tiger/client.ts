/**
 * Tiger Data (TimescaleDB) connection.
 *
 * SERVER ONLY.
 *
 * Read-side analytics only. The address → report path still queries Socrata
 * live; nothing on the critical path depends on this database being up. If it
 * is unreachable, callers fall back to the CSV sources they used before.
 *
 * ⚠️ Two connection gotchas, both verified 2026-09-27:
 *  - `pg` v9 treats `sslmode=require` as `verify-full`, which rejects
 *    Timescale's chain with "self-signed certificate in certificate chain".
 *    Appending `uselibpqcompat=true` restores libpq semantics (encrypted, no
 *    CA verification) — which is what Timescale's own connection string means.
 *  - One Pool per process, module-level. A Pool per request exhausts the
 *    connection limit the moment more than a few lambdas are warm.
 */

import { Pool, type QueryResultRow } from 'pg';

let pool: Pool | null = null;

export function isTigerConfigured(): boolean {
  return (process.env.DATABASE_URL ?? '').trim() !== '';
}

function connectionString(): string {
  const raw = (process.env.DATABASE_URL ?? '').trim();
  if (raw === '') throw new Error('DATABASE_URL is not set.');
  if (raw.includes('uselibpqcompat')) return raw;
  return raw + (raw.includes('?') ? '&' : '?') + 'uselibpqcompat=true';
}

/** The shared pool. Small on purpose: this is a cache in front of a cache. */
export function getPool(): Pool {
  if (pool === null) {
    pool = new Pool({
      connectionString: connectionString(),
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    // A pool error must not take the process down; the caller falls back.
    pool.on('error', (error) => {
      console.warn(`[tiger] idle client error: ${error.message}`);
    });
  }
  return pool;
}

/**
 * Run a query, returning null rather than throwing.
 *
 * Every caller has a CSV fallback, so a database problem should degrade the
 * source rather than surface as an error page.
 */
export async function tigerQuery<T extends QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
): Promise<readonly T[] | null> {
  if (!isTigerConfigured()) return null;

  const startedAt = Date.now();
  try {
    const result = await getPool().query<T>(sql, params as unknown[]);
    console.info(`[tiger] ${result.rowCount ?? 0} rows in ${Date.now() - startedAt}ms`);
    return result.rows;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[tiger] query failed after ${Date.now() - startedAt}ms: ${detail}`);
    return null;
  }
}

/** Used by the ingest script, which needs failures to be loud. */
export async function closePool(): Promise<void> {
  if (pool !== null) {
    await pool.end();
    pool = null;
  }
}
