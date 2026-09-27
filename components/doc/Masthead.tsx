import type { Grade } from '@/lib/grade';
import type { BuildingFacts } from '@/lib/nyc/pluto';
import { Serial } from './primitives';

const GRADE_TONE: Record<string, 'clear' | 'b' | 'c'> = {
  A: 'clear',
  B: 'clear',
  C: 'b',
  D: 'b',
  F: 'c',
};

/**
 * The head of the record: who this building is, and the one number that
 * decides the question.
 *
 * Boldness is spent here and nowhere else. Violations-per-apartment is the
 * product's whole argument — 430 violations is meaningless until you know it is
 * twenty apartments — so it is set at display scale and everything below it
 * stays quiet.
 */
export function Masthead({
  address,
  bbl,
  bin,
  facts,
  perUnit,
  openTotal,
  grade,
  unavailableReason,
}: {
  address: string;
  bbl: string;
  bin: string | null;
  facts: BuildingFacts | null;
  perUnit: number | null;
  openTotal: number | null;
  grade: Grade | null;
  unavailableReason: string | null;
}) {
  return (
    <header className="px-5 pt-6 pb-5 sm:px-7 sm:pt-8">
      <h1 className="font-display text-2xl leading-[1.05] font-700 tracking-[-0.02em] text-ink sm:text-[2.1rem]">
        {address}
      </h1>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Serial>BBL {bbl}</Serial>
        {bin !== null && <Serial>BIN {bin}</Serial>}
        {facts?.yearBuilt != null && (
          <span className="text-[0.78rem] text-ink-faint">Built {facts.yearBuilt}</span>
        )}
        {facts !== null && (
          <span className="text-[0.78rem] text-ink-faint">
            {facts.unitsRes} residential {facts.unitsRes === 1 ? 'unit' : 'units'}
          </span>
        )}
      </div>

      <div className="rule-heavy mt-5 pt-5">
        {perUnit !== null && openTotal !== null && facts !== null ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div
                className="tabular font-display text-[4.5rem] leading-[0.85] font-700 tracking-[-0.04em] text-ink sm:text-[6rem]"
                data-numeric
              >
                {perUnit.toFixed(2)}
              </div>
              <p className="mt-2 max-w-sm text-[0.9rem] leading-snug text-ink-soft">
                open housing violations for every apartment in the building —{' '}
                <span className="tabular text-ink" data-numeric>
                  {openTotal.toLocaleString()}
                </span>{' '}
                across{' '}
                <span className="tabular text-ink" data-numeric>
                  {facts.unitsRes}
                </span>
                .
              </p>
            </div>

            {grade !== null && (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[0.75rem] text-ink-faint">Grade</div>
                  <div className="tabular text-[0.72rem] text-ink-faint" data-numeric>
                    {grade.points}/{grade.maxPoints} risk points
                  </div>
                </div>
                <div
                  className={`stamp font-display text-[2.6rem] leading-none font-700 ${
                    GRADE_TONE[grade.letter] === 'c'
                      ? 'text-class-c'
                      : GRADE_TONE[grade.letter] === 'b'
                        ? 'text-class-b'
                        : 'text-clear'
                  }`}
                  style={{ padding: '0.3rem 0.85rem' }}
                >
                  {grade.letter}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="font-display text-2xl font-600 text-ink-faint">Not enough data</div>
            <p className="mt-1 max-w-md text-[0.88rem] text-ink-soft">
              {unavailableReason ??
                'The violation record for this building could not be retrieved, so the per-apartment rate cannot be computed.'}
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
