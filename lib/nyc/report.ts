/**
 * Assembles one building report from every source, in parallel.
 *
 * Partial failure is deliberate: a dead source degrades its own row to
 * "unavailable" and leaves the rest of the report intact. The alternative —
 * failing the whole page — would make the demo hostage to the flakiest dataset.
 *
 * Each field is a SourceValue, so the UI is forced to distinguish "0" from
 * "we don't know". Rendering a failure as 0 is the exact bug CLAUDE.md trap #1
 * describes.
 */

import { fetchBedbugCount } from './bedbugs';
import { fetchDobViolationCount } from './dobViolations';
import { fetchEvictionCount } from './evictions';
import { fetchHpdViolations, type HpdViolationSummary } from './hpdViolations';
import { fetchLitigationCount } from './litigations';
import { fetchBuildingFacts, type BuildingFacts } from './pluto';
import type { Result } from './result';

export interface SourceValue<T> {
  readonly value: T | null;
  readonly error: string | null;
}

export interface BuildingReport {
  readonly bbl: string;
  readonly bin: string | null;
  readonly facts: SourceValue<BuildingFacts>;
  readonly violations: SourceValue<HpdViolationSummary>;
  readonly litigations: SourceValue<number>;
  readonly evictions: SourceValue<number>;
  readonly bedbugs: SourceValue<number>;
  readonly dobViolations: SourceValue<number>;
  /** Open HPD violations divided by residential units — the product's core metric. */
  readonly openViolationsPerUnit: number | null;
  readonly generatedAt: string;
}

function settle<T>(result: Result<T>): SourceValue<T> {
  return result.ok
    ? { value: result.data, error: null }
    : { value: null, error: result.reason };
}

const UNKNOWN_BIN: SourceValue<number> = {
  value: null,
  error: 'No BIN for this address, so DOB violations cannot be looked up.',
};

/**
 * Fetch every source for one building.
 *
 * `bin` is optional because DOB violations are keyed by BIN rather than BBL;
 * without one, that single row reports unavailable and the rest still renders.
 */
export async function buildBuildingReport(
  bbl: string,
  bin: string | null = null,
): Promise<BuildingReport> {
  const [facts, violations, litigations, evictions, bedbugs, dobViolations] = await Promise.all([
    fetchBuildingFacts(bbl),
    fetchHpdViolations(bbl),
    fetchLitigationCount(bbl),
    fetchEvictionCount(bbl),
    fetchBedbugCount(bbl),
    bin === null ? Promise.resolve(null) : fetchDobViolationCount(bin),
  ]);

  const factsValue = settle(facts);
  const violationsValue = settle(violations);

  // Only computable when BOTH sides succeeded. A missing denominator yields
  // null, never Infinity and never a quietly wrong rate.
  const openViolationsPerUnit =
    violationsValue.value !== null && factsValue.value !== null
      ? violationsValue.value.open.total / factsValue.value.unitsRes
      : null;

  return {
    bbl,
    bin,
    facts: factsValue,
    violations: violationsValue,
    litigations: settle(litigations),
    evictions: settle(evictions),
    bedbugs: settle(bedbugs),
    dobViolations: dobViolations === null ? UNKNOWN_BIN : settle(dobViolations),
    openViolationsPerUnit,
    generatedAt: new Date().toISOString(),
  };
}
