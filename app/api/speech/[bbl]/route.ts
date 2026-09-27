/**
 * Narration of a building's summary, as MP3.
 *
 * Explicitly cached in process, not via `revalidate`. Route handlers stayed
 * dynamic in practice — measured: repeat requests regenerated the audio in
 * ~6s and returned different byte counts every time, so every play would have
 * spent ElevenLabs credits. The same in-memory pattern as zori.ts and
 * stabilized.ts is predictable and verifiable here.
 */

import { NextResponse } from 'next/server';
import { synthesiseSpeech } from '@/lib/elevenlabs';
import { summariseBuilding } from '@/lib/gemini';
import { gradeBuilding } from '@/lib/grade';
import { normalizeBbl } from '@/lib/nyc/bbl';
import { buildBuildingReport } from '@/lib/nyc/report';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface Cached {
  readonly audio: ArrayBuffer;
  readonly at: number;
}

const cache = new Map<string, Cached>();
/** Collapses concurrent requests for the same building into one generation. */
const inFlight = new Map<string, Promise<ArrayBuffer | null>>();

function cachedAudio(bbl: string): ArrayBuffer | null {
  const hit = cache.get(bbl);
  if (hit === undefined) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(bbl);
    return null;
  }
  return hit.audio;
}

async function generate(bbl: string): Promise<ArrayBuffer | null> {
  const report = await buildBuildingReport(bbl);
  const summary = await summariseBuilding(report, gradeBuilding(report));
  if (!summary.ok) return null;

  const audio = await synthesiseSpeech(summary.data);
  if (!audio.ok) return null;

  cache.set(bbl, { audio: audio.data, at: Date.now() });
  return audio.data;
}

function audioResponse(audio: ArrayBuffer, hit: boolean): Response {
  return new Response(audio, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audio.byteLength),
      'Cache-Control': 'public, max-age=86400, immutable',
      'X-Cache': hit ? 'HIT' : 'MISS',
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ bbl: string }> },
): Promise<Response> {
  const { bbl: rawBbl } = await context.params;

  let bbl: string;
  try {
    bbl = normalizeBbl(rawBbl);
  } catch {
    return NextResponse.json({ error: 'Invalid BBL' }, { status: 400 });
  }

  const hit = cachedAudio(bbl);
  if (hit !== null) return audioResponse(hit, true);

  let pending = inFlight.get(bbl);
  if (pending === undefined) {
    pending = generate(bbl).finally(() => inFlight.delete(bbl));
    inFlight.set(bbl, pending);
  }

  const audio = await pending;
  if (audio === null) {
    return NextResponse.json({ error: 'Narration unavailable.' }, { status: 502 });
  }
  return audioResponse(audio, false);
}
