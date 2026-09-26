/**
 * JSON view of a building report.
 *
 * The pages render server-side and could call buildBuildingReport directly,
 * but this endpoint gives a stable contract to capture as demo fixtures and
 * to reuse for the comparison view.
 */

import { NextResponse } from 'next/server';
import { normalizeBbl } from '@/lib/nyc/bbl';
import { buildBuildingReport } from '@/lib/nyc/report';

export const revalidate = 3600;

export async function GET(
  request: Request,
  context: { params: Promise<{ bbl: string }> },
): Promise<NextResponse> {
  const { bbl: rawBbl } = await context.params;

  let bbl: string;
  try {
    bbl = normalizeBbl(rawBbl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid BBL' },
      { status: 400 },
    );
  }

  const bin = new URL(request.url).searchParams.get('bin');
  return NextResponse.json(await buildBuildingReport(bbl, bin));
}
