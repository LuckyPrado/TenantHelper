/**
 * LIVE Gemini check — real API, real building data. Run with `npm run smoke`.
 * Skips itself when GEMINI_API_KEY is absent so the suite stays green without one.
 */
import { describe, expect, it } from 'vitest';
import { gradeBuilding } from './grade';
import { isGeminiConfigured, summariseBuilding } from './gemini';
import { buildBuildingReport } from './nyc/report';

const WORST = { bbl: '1021620074', bin: '1015744' };
const STABILIZED = { bbl: '1021310044', bin: '1063170' };

describe.skipIf(!isGeminiConfigured())('live: Gemini summary', () => {
  it('describes the catastrophic building without inventing law', async () => {
    const report = await buildBuildingReport(WORST.bbl, WORST.bin);
    const result = await summariseBuilding(report, gradeBuilding(report));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    console.log('\n--- 609 W 180 ST ---\n' + result.data + '\n');

    expect(result.data.length).toBeGreaterThan(80);
    // Grounding check: it must not wander into legal deadlines or agencies
    // that were never in the fact sheet.
    expect(result.data).not.toMatch(/\b24 hours\b|\b30 days\b|\b90 days\b/i);
    // Word boundaries matter: an unanchored /sue/ matches "issues".
    expect(result.data).not.toMatch(/(lawyer|attorney|sued?|lawsuit)/i);
  });

  it('reflects the stabilized building accurately', async () => {
    const report = await buildBuildingReport(STABILIZED.bbl, STABILIZED.bin);
    const result = await summariseBuilding(report, gradeBuilding(report));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    console.log('\n--- 500 W 175 ST ---\n' + result.data + '\n');
    expect(result.data.length).toBeGreaterThan(80);
  });
});
