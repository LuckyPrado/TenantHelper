import { describe, expect, it } from 'vitest';
import { isTigerConfigured } from './client';
import { readRentSeries, readStabilization } from './reads';

const ZORI_URL =
  'https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv';

describe.skipIf(!isTigerConfigured())('live: Tiger vs CSV cold start', () => {
  it('replaces a 10MB download with an indexed query', async () => {
    const t0 = Date.now();
    const series = await readRentSeries('10033');
    const tigerMs = Date.now() - t0;

    const t1 = Date.now();
    const csv = await (await fetch(ZORI_URL)).text();
    const csvMs = Date.now() - t1;

    const t2 = Date.now();
    await readStabilization('1021310044');
    const stabMs = Date.now() - t2;

    console.log(
      [
        '',
        `  Tiger area rent  : ${tigerMs}ms (${series?.length} points)`,
        `  Tiger stabilized : ${stabMs}ms`,
        `  CSV cold download: ${csvMs}ms (${(csv.length / 1e6).toFixed(1)}MB, before parsing)`,
        `  cold-start speedup: ${Math.round(csvMs / Math.max(tigerMs, 1))}x`,
        '',
      ].join('\n'),
    );

    expect(series).not.toBeNull();
    expect(tigerMs).toBeLessThan(csvMs);
  });
});
