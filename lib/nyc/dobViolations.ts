/**
 * DOB Violations — dataset 3h2n-5cm9.
 *
 * Keyed by BIN, not BBL. BIN identifies a physical building; BBL identifies a
 * tax lot, which can hold several buildings. GeoSearch returns both.
 */

import { fail, type Result } from './result';
import { socrataCount, soqlString } from './socrata';

export const DOB_VIOLATIONS_DATASET = '3h2n-5cm9';

/** BINs are 7 digits, first digit is the borough. */
const BIN_PATTERN = /^[1-5]\d{6}$/;

/** Department of Buildings violations. Verified: 19 for BIN 1063170. */
export async function fetchDobViolationCount(
  bin: string,
  fetchImpl?: typeof fetch,
): Promise<Result<number>> {
  const trimmed = bin.trim();
  if (!BIN_PATTERN.test(trimmed)) {
    return fail(`Invalid BIN ${JSON.stringify(bin)}: expected 7 digits starting 1-5`);
  }
  return socrataCount(DOB_VIOLATIONS_DATASET, `bin=${soqlString(trimmed)}`, {
    keyDesc: `bin=${trimmed}`,
    fetchImpl,
  });
}
