/**
 * Every data fetcher returns a Result. A source that fails must surface as an
 * explicit failure, never as zero.
 *
 * This exists because of the trap documented in CLAUDE.md: HPD violations
 * returns `count: 0` when queried on a column it does not have. If a failed
 * fetch could also read as 0, the UI would confidently report a slum as
 * spotless. Making failure a distinct shape from "genuinely zero" is the whole
 * point of this type.
 */

export type Result<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly reason: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail<T = never>(reason: string): Result<T> {
  return { ok: false, reason };
}

/** Narrowing helper for callers that need to filter a batch of results. */
export function isOk<T>(r: Result<T>): r is { ok: true; data: T } {
  return r.ok;
}
