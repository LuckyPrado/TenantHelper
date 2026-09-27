/**
 * Address -> BBL/BIN, for the client-side search on the landing screen.
 *
 * Thin wrapper over the existing geocoder so the landing overlay can resolve
 * an address without a full page navigation — the fade and the camera move
 * need to start before we route anywhere.
 */

import { NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/nyc/geosearch';

export async function GET(request: Request): Promise<NextResponse> {
  const query = new URL(request.url).searchParams.get('q') ?? '';
  const result = await geocodeAddress(query);

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    bbl: result.data.bbl,
    bin: result.data.bin,
    label: result.data.label,
    matchType: result.data.matchType,
  });
}
