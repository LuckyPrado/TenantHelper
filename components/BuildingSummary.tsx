import { ListenButton } from '@/components/ListenButton';
import { Section } from '@/components/doc/primitives';
import { isElevenLabsConfigured } from '@/lib/elevenlabs';
import { isGeminiConfigured, summariseBuilding } from '@/lib/gemini';
import type { Grade } from '@/lib/grade';
import type { BuildingReport } from '@/lib/nyc/report';

export function SummarySkeleton() {
  return (
    <Section title="In plain English">
      <div className="space-y-2" aria-hidden>
        <div className="h-3 w-full animate-pulse bg-paper-sunk" />
        <div className="h-3 w-11/12 animate-pulse bg-paper-sunk" />
        <div className="h-3 w-4/5 animate-pulse bg-paper-sunk" />
      </div>
      <span className="sr-only">Generating summary</span>
    </Section>
  );
}

/**
 * Plain-English read of the record.
 *
 * Streams in after the numbers via Suspense, and stays silent when
 * unconfigured or when the call fails — the report is complete without it, and
 * a broken box mid-demo is worse than no box.
 */
export async function BuildingSummary({
  report,
  grade,
}: {
  readonly report: BuildingReport;
  readonly grade: Grade | null;
}) {
  if (!isGeminiConfigured()) return null;

  const summary = await summariseBuilding(report, grade);
  if (!summary.ok) return null;

  return (
    <Section
      title="In plain English"
      aside={
        <span className="flex items-center gap-3">
          {isElevenLabsConfigured() && <ListenButton bbl={report.bbl} />}
          <span>Gemini</span>
        </span>
      }
    >
      <p className="text-[0.95rem] leading-relaxed text-ink">{summary.data}</p>
      <p className="mt-2 text-[0.72rem] leading-snug text-ink-faint">
        Written by Gemini from the figures on this page and nothing else. A summary of the public
        record, not advice.
      </p>
    </Section>
  );
}
