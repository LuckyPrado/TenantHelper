import { describe, expect, it } from 'vitest';
import { RIGHTS_GROUPS, allTopics } from './tenantRights';

describe('tenant rights reference', () => {
  it('gives every topic at least one official source', () => {
    for (const topic of allTopics()) {
      expect(topic.sources.length, topic.id).toBeGreaterThan(0);
      for (const source of topic.sources) {
        expect(source.url, `${topic.id} → ${source.label}`).toMatch(/^https:\/\//);
      }
    }
  });

  it('cites only government sources', () => {
    const hosts = allTopics()
      .flatMap((topic) => topic.sources)
      .map((source) => new URL(source.url).hostname);

    for (const host of hosts) {
      expect(host, host).toMatch(/(^|\.)(nyc\.gov|ny\.gov|nycourts\.gov)$/);
    }
  });

  it('never states a violation correction deadline', () => {
    // HPD sets the deadline per violation on the Notice of Violation. There is
    // no single deadline per class, and a tenant could act on an invented one.
    //
    // Checked per sentence, and only where a period sits beside correction
    // language: "hot water 24 hours a day" and "within fourteen days of moving
    // out" are both real rules, so a blanket ban on time periods would be wrong.
    const CORRECTION = /\b(correct|cure|remedy|abate)\w*\b/i;
    const PERIOD =
      /\b(\d+|one|two|three|five|seven|ten|fourteen|thirty|ninety)\s*(hour|day|week|month)s?\b/i;

    const sentences = allTopics()
      .flatMap((topic) => [topic.headline, ...topic.detail])
      .flatMap((line) => line.split(/(?<=[.!?])\s+/));

    const offenders = sentences.filter((line) => CORRECTION.test(line) && PERIOD.test(line));
    expect(offenders, offenders.join(' | ')).toHaveLength(0);
  });

  it('keeps ids unique so React keys and anchors are stable', () => {
    const ids = allTopics().map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);

    const groupIds = RIGHTS_GROUPS.map((group) => group.id);
    expect(new Set(groupIds).size).toBe(groupIds.length);
  });

  it('states the heat rules HPD actually publishes', () => {
    const heat = allTopics().find((topic) => topic.id === 'heat');
    expect(heat).toBeDefined();
    const prose = [heat?.headline, ...(heat?.detail ?? [])].join(' ');

    expect(prose).toContain('68°F');
    expect(prose).toContain('62°F');
    expect(prose).toContain('120°F');
    expect(prose).toContain('55°F');
  });
});
