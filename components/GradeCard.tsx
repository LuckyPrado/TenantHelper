import type { EvaluatedRule, Grade } from '@/lib/grade';
import { Section } from './doc/primitives';

const MARK: Readonly<Record<EvaluatedRule['outcome'], string>> = {
  triggered: '×',
  clear: '✓',
  'not-assessed': '–',
};

function RuleRow({ rule }: { readonly rule: EvaluatedRule }) {
  const triggered = rule.outcome === 'triggered';

  return (
    <li
      className={`flex gap-3 border-b border-paper-edge/60 py-2 last:border-b-0 ${
        triggered ? '' : 'opacity-55'
      }`}
    >
      <span
        aria-hidden
        className={`w-3 shrink-0 text-center text-[0.9rem] ${triggered ? 'text-class-c' : 'text-ink-faint'}`}
      >
        {MARK[rule.outcome]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[0.88rem] font-500 text-ink">{rule.label}</span>
          <span className="tabular text-[0.75rem] text-ink-faint" data-numeric>
            {triggered ? `+${rule.points}` : `0 of ${rule.points}`}
          </span>
        </div>
        {/* The threshold is printed verbatim: the grade has to be auditable on
            sight, or it is the black box the product rules forbid. */}
        <div className="text-[0.75rem] leading-snug text-ink-faint">
          {rule.threshold}
          {rule.observed !== null && <> — found {rule.observed}</>}
          {rule.outcome === 'not-assessed' && <> — not checked, source unavailable</>}
        </div>
      </div>
      {rule.datasetId !== null && (
        <a
          href={`https://data.cityofnewyork.us/d/${rule.datasetId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 self-start text-[0.7rem] text-ink-faint underline decoration-dotted underline-offset-2 hover:text-ink"
          aria-label={`Source dataset for ${rule.label}`}
        >
          source
        </a>
      )}
    </li>
  );
}

/**
 * How the grade was reached, rule by rule.
 *
 * Thresholds, points and the observed value are all on screen. A grade a judge
 * cannot audit in ten seconds should not ship.
 */
export function GradeCard({ grade }: { readonly grade: Grade | null }) {
  if (grade === null) {
    return (
      <Section title="How this grade was reached">
        <p className="text-[0.88rem] text-ink-faint">
          The violation record is unavailable, so grading this building would be guesswork.
        </p>
      </Section>
    );
  }

  return (
    <Section
      title="How this grade was reached"
      aside={
        <span className="tabular" data-numeric>
          {grade.points} of {grade.maxPoints} risk points
          {grade.notAssessed > 0 && ` · ${grade.notAssessed} unchecked`}
        </span>
      }
    >
      <ul>
        {grade.rules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} />
        ))}
      </ul>
      <p className="mt-3 text-[0.75rem] leading-snug text-ink-faint">
        Every rule and threshold is fixed and shown above; there is no hidden weighting. The grade
        reflects public filings, not an inspection.
      </p>
    </Section>
  );
}
