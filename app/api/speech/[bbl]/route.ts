/**
 * Narration of a building's summary, as MP3.
 *
 * Cached hard: ElevenLabs credits are the binding constraint, so a building
 * narrated once is never narrated again within the revalidate window. The demo
 * buildings are pre-warmed by `npm run prewarm`, so the demo itself spends none.
 */

import { NextResponse } from 'next/server';
import { synthesiseSpeech } from '@/lib/elevenlabs';
import { summariseBuilding } from '@/lib/gemini';
import { gradeBuilding } from '@/lib/grade';
import { normalizeBbl } from '@/lib/nyc/bbl';
import { buildBuildingReport } from '@/lib/nyc/report';

/** 24h: the underlying record barely moves, and re-narrating costs credits. */
export const revalidate = 86400;

export async function GET(
  request: Request,
  context: { params: Promise<{ bbl: string }> },
): Promise<Response> {
  const { bbl: rawBbl } = await context.params;

  let bbl: string;
  try {
    bbl = normalizeBbl(rawBbl);
  } catch {
    return NextResponse.json({ error: 'Invalid BBL' }, { status: 400 });
  }

  const report = await buildBuildingReport(bbl, new URL(request.url).searchParams.get('bin'));
  const summary = await summariseBuilding(report, gradeBuilding(report));
  if (!summary.ok) {
    return NextResponse.json({ error: summary.reason }, { status: 502 });
  }

  const audio = await synthesiseSpeech(summary.data);
  if (!audio.ok) {
    return NextResponse.json({ error: audio.reason }, { status: 502 });
  }

  return new Response(audio.data, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
