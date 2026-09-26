import type { SourceValue } from '@/lib/nyc/report';

interface StatCardProps {
  readonly label: string;
  readonly source: SourceValue<number>;
  /** Socrata dataset id, so every number on screen links to where it came from. */
  readonly datasetId: string;
  readonly datasetName: string;
  readonly emphasis?: boolean;
}

function datasetUrl(datasetId: string): string {
  return `https://data.cityofnewyork.us/d/${datasetId}`;
}

/**
 * One sourced figure.
 *
 * An unavailable source renders as "Unavailable" with its reason — never as 0.
 * Showing 0 for a failed fetch would tell someone a building is clean when we
 * simply could not find out.
 */
export function StatCard({ label, source, datasetId, datasetName, emphasis }: StatCardProps) {
  const unavailable = source.value === null;

  return (
    <div
      className={`rounded-lg border p-4 ${
        emphasis ? 'border-amber-500/60 bg-amber-500/5' : 'border-black/10 dark:border-white/15'
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide opacity-60">{label}</div>

      {unavailable ? (
        <>
          <div className="mt-1 text-2xl font-semibold opacity-50">Unavailable</div>
          <p className="mt-1 text-xs leading-snug opacity-60">{source.error}</p>
        </>
      ) : (
        <div className="mt-1 text-3xl font-semibold tabular-nums">
          {source.value.toLocaleString()}
        </div>
      )}

      <a
        href={datasetUrl(datasetId)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-xs underline opacity-50 hover:opacity-100"
      >
        {datasetName}
      </a>
    </div>
  );
}
