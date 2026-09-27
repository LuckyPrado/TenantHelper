import { ListenButton } from '@/components/ListenButton';
import { isElevenLabsConfigured } from '@/lib/elevenlabs';
import { isGeminiConfigured, summariseBuilding } from '@/lib/gemini';
import type { Grade } from '@/lib/grade';
import type { BuildingReport } from '@/lib/nyc/report';

export function SummarySkeleton() {
  return (
    <section className="rounded-xl border border-black/10 p-6 dark:border-white/15">
      <div className="text-xs font-medium uppercase tracking-wide opacity-60">In plain English</div>
      <div className="mt-3 space-y-2" aria-hidden>
        <div className="h-3 w-full animate-pulse rounded bg-current opacity-10" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-current opacity-10" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-current opacity-10" />
      </div>
      <span className="sr-only">Generating summary…</span>
    </section>
  );
}

/**
 * Plain-English read of the building's record.
 *
 * Rendered inside a Suspense boundary so the Gemini call streams in after the
 * numbers, rather than holding up the whole page behind a network round trip.
 *
 * Silent when unconfigured or when the call fails: the report is complete
 * without it, and a broken box mid-demo is worse than no box.
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
    <section className="rounded-xl border border-black/10 p-6 dark:border-white/15">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide opacity-60">In plain English</h2>
        <div className="flex items-center gap-3">
          {isElevenLabsConfigured() && <ListenButton bbl={report.bbl} bin={report.bin} />}
          <span className="text-xs opacity-40">Gemini</span>
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{summary.data}</p>
      <p className="mt-3 text-xs leading-snug opacity-60">
        Written by Gemini from the figures on this page and nothing else. It is a summary of the
        public record, not advice — the sourced numbers above are what matter.
      </p>
    </section>
  );
}
