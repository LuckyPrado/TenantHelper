import { describe, expect, it } from 'vitest';
import type { BuildingReport } from './nyc/report';
import { isHeatSeason, rightsFor } from './rights';

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

const JULY = new Date('2026-07-15');
const JANUARY = new Date('2026-01-15');

describe('isHeatSeason', () => {
  it('covers October through May', () => {
    expect(isHeatSeason(new Date('2026-10-01'))).toBe(true);
    expect(isHeatSeason(new Date('2026-12-15'))).toBe(true);
    expect(isHeatSeason(new Date('2026-05-31'))).toBe(true);
  });

  it('excludes June through September', () => {
    expect(isHeatSeason(new Date('2026-06-15'))).toBe(false);
    expect(isHeatSeason(new Date('2026-09-26'))).toBe(false);
  });
});

describe('rightsFor', () => {
  it('shows nothing for a clean building out of heat season', () => {
    expect(rightsFor(report(), JULY)).toEqual([]);
  });

  it('surfaces the Class C right when hazards are open', () => {
    const rights = rightsFor(
      report({
        violations: clear({
          open: { a: 0, b: 0, c: 27, other: 0, total: 27 },
          closed: { a: 0, b: 0, c: 0, other: 0, total: 0 },
        }),
      }),
      JULY,
    );

    const classC = rights.find((r) => r.id === 'class-c');
    expect(classC).toBeDefined();
    expect(classC?.because).toMatch(/27 open Class C/);
  });

  it('does not invent a correction deadline', () => {
    const rights = rightsFor(
      report({
        violations: clear({
          open: { a: 0, b: 0, c: 5, other: 0, total: 5 },
          closed: { a: 0, b: 0, c: 0, other: 0, total: 0 },
        }),
      }),
      JULY,
    );

    // HPD sets deadlines per violation on the Notice of Violation. Asserting a
    // blanket "24 hours" or "30 days" would be wrong and actionable.
    const classC = rights.find((r) => r.id === 'class-c');
    expect(classC?.summary).toMatch(/printed on the Notice/);
    expect(classC?.summary).not.toMatch(/24 hours|30 days|90 days/);
  });

  it('adds heat rights only during heat season', () => {
    expect(rightsFor(report(), JANUARY).some((r) => r.id === 'heat')).toBe(true);
    expect(rightsFor(report(), JULY).some((r) => r.id === 'heat')).toBe(false);
  });

  it('adds the stabilized right only when the building is listed', () => {
    const stabilized = report({
      stabilization: clear({ bbl: '1021310044', isStabilized: true, buildingClass: null }),
    });

    expect(rightsFor(stabilized, JULY).some((r) => r.id === 'stabilized')).toBe(true);
    expect(rightsFor(report(), JULY).some((r) => r.id === 'stabilized')).toBe(false);
  });

  it('every right cites an official source and says why it appeared', () => {
    const rights = rightsFor(
      report({
        violations: clear({
          open: { a: 1, b: 1, c: 1, other: 0, total: 3 },
          closed: { a: 0, b: 0, c: 0, other: 0, total: 0 },
        }),
        litigations: clear(15),
        bedbugs: clear(8),
        stabilization: clear({ bbl: '1021310044', isStabilized: true, buildingClass: null }),
      }),
      JANUARY,
    );

    expect(rights.length).toBeGreaterThan(4);
    for (const right of rights) {
      expect(right.sourceUrl).toMatch(/^https:\/\/(www\.nyc\.gov|portal\.311\.nyc\.gov|hcr\.ny\.gov)/);
      expect(right.because.length).toBeGreaterThan(5);
    }
  });

  it('treats an unavailable source as absent rather than triggering a right', () => {
    const rights = rightsFor(report({ bedbugs: unavailable, litigations: unavailable }), JULY);

    expect(rights.some((r) => r.id === 'bedbugs')).toBe(false);
    expect(rights.some((r) => r.id === 'hp-action')).toBe(false);
  });
});
