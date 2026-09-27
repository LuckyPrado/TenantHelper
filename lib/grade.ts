/**
 * A transparent, rule-based building grade.
 *
 * Product rule (CLAUDE.md): no composite 0-100 score. Every rule, its exact
 * threshold and its point value are exported as DATA so the UI can print them
 * beside the grade. A judge should be able to audit the whole thing in ten
 * seconds; if they cannot, it should not ship.
 *
 * A rule whose input is unavailable is NOT scored. Grading a building on data
 * we failed to fetch would quietly reward an outage — the same class of bug as
 * rendering a failed source as zero.
 */

import type { BuildingReport } from './nyc/report';

export type RuleOutcome = 'triggered' | 'clear' | 'not-assessed';

export interface GradeRule {
  readonly id: string;
  /**
   * Rules in a group are mutually exclusive bands of the same measure, so only
   * the highest can trigger. maxPoints counts each group once.
   */
  readonly group: string;
  readonly label: string;
  /** Human-readable threshold, printed verbatim in the UI. */
  readonly threshold: string;
  readonly points: number;
  readonly datasetId: string | null;
}

export interface EvaluatedRule extends GradeRule {
  readonly outcome: RuleOutcome;
  /** The observed value, formatted for display. Null when not assessed. */
  readonly observed: string | null;
}

export type Letter = 'A' | 'B' | 'C' | 'D' | 'F';

export interface Grade {
  readonly letter: Letter;
  readonly points: number;
  readonly maxPoints: number;
  readonly rules: readonly EvaluatedRule[];
  /** How many rules could not be evaluated because a source was unavailable. */
  readonly notAssessed: number;
}

/** Point thresholds, worst first. A building scoring >= `atLeast` gets `letter`. */
export const GRADE_BANDS: readonly { readonly letter: Letter; readonly atLeast: number }[] = [
  { letter: 'F', atLeast: 9 },
  { letter: 'D', atLeast: 6 },
  { letter: 'C', atLeast: 3 },
  { letter: 'B', atLeast: 1 },
  { letter: 'A', atLeast: 0 },
];

/** Every rule is scored only when its input is available. */
export const GRADE_RULES: readonly GradeRule[] = [
  {
    id: 'per-unit-extreme',
    group: 'violation-load',
    label: 'Extreme violation load',
    threshold: '5 or more open HPD violations per apartment',
    points: 4,
    datasetId: 'wvxf-dwi5',
  },
  {
    id: 'per-unit-severe',
    group: 'violation-load',
    label: 'Heavy violation load',
    threshold: '1 to 5 open HPD violations per apartment',
    points: 3,
    datasetId: 'wvxf-dwi5',
  },
  {
    id: 'per-unit-moderate',
    group: 'violation-load',
    label: 'Elevated violation load',
    threshold: '0.25 to 1 open HPD violations per apartment',
    points: 1,
    datasetId: 'wvxf-dwi5',
  },
  {
    id: 'class-c-extreme',
    group: 'class-c',
    label: 'Severe concentration of hazards',
    threshold: '50 or more open Class C violations',
    points: 4,
    datasetId: 'wvxf-dwi5',
  },
  {
    id: 'class-c-severe',
    group: 'class-c',
    label: 'Many immediately hazardous violations',
    threshold: '10 to 50 open Class C violations',
    points: 3,
    datasetId: 'wvxf-dwi5',
  },
  {
    id: 'class-c-any',
    group: 'class-c',
    label: 'Immediately hazardous violations present',
    threshold: '1 to 10 open Class C violations',
    points: 2,
    datasetId: 'wvxf-dwi5',
  },
  {
    id: 'litigation-severe',
    group: 'litigation',
    label: 'Repeatedly taken to housing court',
    threshold: '5 or more housing court cases',
    points: 2,
    datasetId: '59kj-x8nc',
  },
  {
    id: 'litigation-any',
    group: 'litigation',
    label: 'Housing court history',
    threshold: '1 to 5 housing court cases',
    points: 1,
    datasetId: '59kj-x8nc',
  },
  {
    id: 'evictions',
    group: 'evictions',
    label: 'Eviction history',
    threshold: '1 or more executed evictions',
    points: 1,
    datasetId: '6z8x-wfk4',
  },
  {
    id: 'bedbugs',
    group: 'bedbugs',
    label: 'Bedbug filings',
    threshold: '1 or more bedbug infestation filings',
    points: 1,
    datasetId: 'wz6d-d3jb',
  },
];

/**
 * The worst realistically achievable score: the highest band of each group,
 * counted once. Summing every rule would overstate the ceiling, because the
 * bands within a group are mutually exclusive.
 */
export const MAX_POINTS: number = [...new Set(GRADE_RULES.map((r) => r.group))].reduce(
  (sum, group) =>
    sum + Math.max(...GRADE_RULES.filter((r) => r.group === group).map((r) => r.points)),
  0,
);

function letterFor(points: number): Letter {
  return GRADE_BANDS.find((band) => points >= band.atLeast)?.letter ?? 'A';
}

function evaluate(
  rule: GradeRule,
  value: number | null,
  test: (value: number) => boolean,
  format: (value: number) => string,
): EvaluatedRule {
  if (value === null) return { ...rule, outcome: 'not-assessed', observed: null };
  return {
    ...rule,
    outcome: test(value) ? 'triggered' : 'clear',
    observed: format(value),
  };
}

/**
 * Grade a building.
 *
 * Returns null when too little is known to be fair — currently when the
 * violation record itself is unavailable, since it carries most of the weight.
 */
export function gradeBuilding(report: BuildingReport): Grade | null {
  const perUnit = report.openViolationsPerUnit;
  const classC = report.violations.value?.open.c ?? null;
  if (perUnit === null && classC === null) return null;

  const litigations = report.litigations.value;
  const evictions = report.evictions.value;
  const bedbugs = report.bedbugs.value;

  const byId = (id: string): GradeRule => {
    const rule = GRADE_RULES.find((r) => r.id === id);
    if (rule === undefined) throw new Error(`Unknown grade rule ${id}`);
    return rule;
  };

  const perUnitText = (value: number): string => `${value.toFixed(2)} per apartment`;
  const countText = (noun: string) => (value: number) => `${value.toLocaleString()} ${noun}`;

  const rules: readonly EvaluatedRule[] = [
    evaluate(byId('per-unit-extreme'), perUnit, (v) => v >= 5, perUnitText),
    evaluate(byId('per-unit-severe'), perUnit, (v) => v >= 1 && v < 5, perUnitText),
    evaluate(byId('per-unit-moderate'), perUnit, (v) => v >= 0.25 && v < 1, perUnitText),
    evaluate(byId('class-c-extreme'), classC, (v) => v >= 50, countText('open Class C')),
    evaluate(byId('class-c-severe'), classC, (v) => v >= 10 && v < 50, countText('open Class C')),
    evaluate(byId('class-c-any'), classC, (v) => v >= 1 && v < 10, countText('open Class C')),
    evaluate(byId('litigation-severe'), litigations, (v) => v >= 5, countText('cases')),
    evaluate(byId('litigation-any'), litigations, (v) => v >= 1 && v < 5, countText('cases')),
    evaluate(byId('evictions'), evictions, (v) => v >= 1, countText('evictions')),
    evaluate(byId('bedbugs'), bedbugs, (v) => v >= 1, countText('filings')),
  ];

  const points = rules
    .filter((rule) => rule.outcome === 'triggered')
    .reduce((sum, rule) => sum + rule.points, 0);

  return {
    letter: letterFor(points),
    points,
    maxPoints: MAX_POINTS,
    rules,
    notAssessed: rules.filter((rule) => rule.outcome === 'not-assessed').length,
  };
}
