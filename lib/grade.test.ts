import { describe, expect, it } from 'vitest';
import { GRADE_RULES, MAX_POINTS, gradeBuilding } from './grade';
import type { BuildingReport } from './nyc/report';

const clear = <T>(value: T) => ({ value, error: null });
const unavailable = { value: null, error: 'source down' };

function report(overrides: Partial<BuildingReport> = {}): BuildingReport {
  return {
    bbl: '1021310044',
    bin: null,
    facts: unavailable,
    violations: clear({
      open: { a: 0, b: 0, c: 0, other: 0, total: 0 },
      closed: { a: 0, b: 0, c: 0, other: 0, total: 0 },
    }),
    litigations: clear(0),
    evictions: clear(0),
    bedbugs: clear(0),
    dobViolations: clear(0),
    areaRent: unavailable,
    stabilization: unavailable,
    landlord: unavailable,
    openViolationsPerUnit: 0,
    generatedAt: '2026-09-26T00:00:00.000Z',
    ...overrides,
  } as BuildingReport;
}

function withViolations(perUnit: number, classC: number): BuildingReport {
  return report({
    openViolationsPerUnit: perUnit,
    violations: clear({
      open: { a: 0, b: 0, c: classC, other: 0, total: Math.round(perUnit * 20) },
      closed: { a: 0, b: 0, c: 0, other: 0, total: 0 },
    }),
  });
}

describe('rule catalogue', () => {
  it('every rule states a threshold the UI can print verbatim', () => {
    for (const rule of GRADE_RULES) {
      expect(rule.threshold.length).toBeGreaterThan(10);
      expect(rule.points).toBeGreaterThan(0);
    }
  });

  it('rule ids are unique', () => {
    expect(new Set(GRADE_RULES.map((r) => r.id)).size).toBe(GRADE_RULES.length);
  });

  it('MAX_POINTS counts each mutually-exclusive group once, not every rule', () => {
    // Summing all rules would overstate the ceiling, since bands within a
    // group cannot trigger together.
    expect(MAX_POINTS).toBe(12);
    expect(MAX_POINTS).toBeLessThan(GRADE_RULES.reduce((sum, r) => sum + r.points, 0));
  });

  it('ranks a catastrophic building above a merely bad one', () => {
    // Regression guard: before the extreme tiers existed, 500 W 175 St (1.71
    // per unit) outscored 609 W 180 St (21.50 per unit) because it happened to
    // have bedbug filings. Both saturated the top band, so the scale could not
    // separate them and the ranking inverted.
    const catastrophic = gradeBuilding(
      report({
        openViolationsPerUnit: 21.5,
        violations: clear({
          open: { a: 46, b: 179, c: 204, other: 1, total: 430 },
          closed: { a: 0, b: 0, c: 0, other: 0, total: 655 },
        }),
        litigations: clear(36),
        evictions: clear(1),
        bedbugs: clear(0),
      }),
    );
    const bad = gradeBuilding(
      report({
        openViolationsPerUnit: 1.71,
        violations: clear({
          open: { a: 14, b: 58, c: 27, other: 0, total: 99 },
          closed: { a: 0, b: 0, c: 0, other: 0, total: 504 },
        }),
        litigations: clear(15),
        evictions: clear(3),
        bedbugs: clear(8),
      }),
    );

    expect(catastrophic!.points).toBeGreaterThan(bad!.points);
  });
});

describe('gradeBuilding', () => {
  it('gives a spotless building an A with zero points', () => {
    const grade = gradeBuilding(withViolations(0, 0));

    expect(grade?.letter).toBe('A');
    expect(grade?.points).toBe(0);
  });

  it('grades 609 W 180 St an F', () => {
    // 21.5 per unit, 204 open Class C, 36 cases, 1 eviction.
    const grade = gradeBuilding(
      report({
        openViolationsPerUnit: 21.5,
        violations: clear({
          open: { a: 46, b: 179, c: 204, other: 1, total: 430 },
          closed: { a: 0, b: 0, c: 0, other: 0, total: 655 },
        }),
        litigations: clear(36),
        evictions: clear(1),
        bedbugs: clear(0),
      }),
    );

    expect(grade?.letter).toBe('F');
    expect(grade?.points).toBe(11);
  });

  it('never triggers the severe and moderate band of the same measure together', () => {
    const grade = gradeBuilding(withViolations(21.5, 204));
    const triggered = grade?.rules.filter((r) => r.outcome === 'triggered').map((r) => r.id) ?? [];

    expect(triggered).toContain('per-unit-extreme');
    expect(triggered).not.toContain('per-unit-severe');
    expect(triggered).not.toContain('per-unit-moderate');
    expect(triggered).toContain('class-c-extreme');
    expect(triggered).not.toContain('class-c-severe');
    expect(triggered).not.toContain('class-c-any');
  });

  it('does NOT score a rule whose source failed', () => {
    const grade = gradeBuilding(
      report({ ...withViolations(0, 0), litigations: unavailable, evictions: unavailable }),
    );

    // Grading on data we could not fetch would quietly reward an outage.
    // Two dead sources disable three rules: litigations drives both the
    // "severe" and "any" bands, evictions drives one.
    expect(grade?.notAssessed).toBe(3);
    const litigation = grade?.rules.find((r) => r.id === 'litigation-any');
    expect(litigation?.outcome).toBe('not-assessed');
    expect(litigation?.observed).toBeNull();
  });

  it('records the observed value so the grade can be audited', () => {
    const grade = gradeBuilding(withViolations(1.71, 27));
    const rule = grade?.rules.find((r) => r.id === 'per-unit-severe');

    expect(rule?.outcome).toBe('triggered');
    expect(rule?.observed).toBe('1.71 per apartment');
  });

  it('returns null when the violation record itself is unknown', () => {
    const grade = gradeBuilding(
      report({ openViolationsPerUnit: null, violations: unavailable }),
    );

    expect(grade).toBeNull();
  });

  it('places a middling building between the extremes', () => {
    const grade = gradeBuilding(
      report({
        openViolationsPerUnit: 0.4,
        violations: clear({
          open: { a: 2, b: 3, c: 1, other: 0, total: 6 },
          closed: { a: 0, b: 0, c: 0, other: 0, total: 0 },
        }),
        litigations: clear(1),
      }),
    );

    // 1 (elevated load) + 2 (any Class C) + 1 (one case) = 4 -> C
    expect(grade?.points).toBe(4);
    expect(grade?.letter).toBe('C');
  });
});
