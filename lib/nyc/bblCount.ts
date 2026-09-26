/**
 * Factory for the datasets that are a simple "count rows for this BBL".
 *
 * Litigations, evictions and bedbug filings all expose a real `bbl` column
 * (unlike HPD violations — see hpdViolations.ts). Sharing the construction
 * keeps the three source modules honest and identical in failure behaviour.
 */

import { normalizeBbl } from './bbl';
import { fail, type Result } from './result';
import { socrataCount, soqlString } from './socrata';

export type BblCountFetcher = (bbl: string, fetchImpl?: typeof fetch) => Promise<Result<number>>;

export function makeBblCountFetcher(datasetId: string): BblCountFetcher {
  return async (bbl, fetchImpl) => {
    let normalized: string;
    try {
      normalized = normalizeBbl(bbl);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    return socrataCount(datasetId, `bbl=${soqlString(normalized)}`, {
      keyDesc: `bbl=${normalized}`,
      fetchImpl,
    });
  };
}
