import type { EvaluatedRule, Grade, Letter } from '@/lib/grade';

const LETTER_STYLES: Readonly<Record<Letter, string>> = {
  A: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  B: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
  C: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  D: 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  F: 'border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-300',
};

const OUTCOME_MARK: Readonly<Record<EvaluatedRule['outcome'], string>> = {
  triggered: '✕',
  clear: '✓',
  'not-assessed': '–',
};

function RuleRow({ rule }: { readonly rule: EvaluatedRule }) {
  const dimmed = rule.outcome !== 'triggered';

  return (
    <li className={`flex gap-3 py-2 ${dimmed ? 'opacity-55' : ''}`}>
      <span
        aria-hidden
        className={`mt-0.5 w-4 shrink-0 text-center text-sm ${
          rule.outcome === 'triggered' ? 'text-red-600 dark:text-red-400' : ''
        }`}
      >
        {OUTCOME_MARK[rule.outcome]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-medium">{rule.label}</span>
          <span className="text-xs tabular-nums opacity-60">
            {rule.outcome === 'triggered' ? `+${rule.points}` : `0 of ${rule.points}`}
          </span>
        </div>
        {/* The threshold is printed verbatim — the grade must be auditable on sight. */}
        <div className="text-xs opacity-70">
          {rule.threshold}
          {rule.observed !== null && <> · found {rule.observed}</>}
          {rule.outcome === 'not-assessed' && <> · not assessed, source unavailable</>}
        </div>
      </div>
      {rule.datasetId !== null && (
        <a
          href={`https://data.cityofnewyork.us/d/${rule.datasetId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 self-start text-xs underline opacity-40 hover:opacity-100"
          aria-label={`Source dataset for ${rule.label}`}
        >
          source
        </a>
      )}
    </li>
  );
}

/**
 * The building grade, shown with every rule that produced it.
 *
 * Product rule: no black box. Thresholds, points and the observed value are all
 * on screen, each linking to its dataset, so the grade can be audited in ten
 * seconds rather than taken on trust.
 */
export function GradeCard({ grade }: { readonly grade: Grade | null }) {
  if (grade === null) {
    return (
      <section className="rounded-xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="text-xs font-medium uppercase tracking-wide opacity-60">Building grade</h2>
        <div className="mt-1 text-2xl font-semibold opacity-50">Not graded</div>
        <p className="mt-1 text-sm opacity-70">
          The violation record is unavailable, so grading this building would be guesswork.
        </p>
      </section>
    );
  }

  return (
    <section className={`rounded-xl border p-6 ${LETTER_STYLES[grade.letter]}`}>
      <div className="flex items-start gap-5">
        <div className="text-6xl font-bold leading-none tabular-nums">{grade.letter}</div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-medium uppercase tracking-wide opacity-70">Building grade</h2>
          <p className="mt-1 text-sm opacity-80">
            {grade.points} of {grade.maxPoints} risk points from the rules below.
            {grade.notAssessed > 0 && (
              <> {grade.notAssessed} could not be checked, so this is a partial grade.</>
            )}
          </p>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-current/10 border-t border-current/10 pt-1 text-current">
        {grade.rules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} />
        ))}
      </ul>

      <p className="mt-3 text-xs opacity-70">
        Every rule and threshold is fixed and shown above — there is no hidden weighting. A grade
        reflects public filings, not an inspection.
      </p>
    </section>
  );
}
