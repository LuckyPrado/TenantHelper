import type { SourceValue } from '@/lib/nyc/report';
import type { AreaRent, RentPoint } from '@/lib/nyc/zori';

const VIEWBOX_WIDTH = 600;
const VIEWBOX_HEIGHT = 120;

function usd(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function monthLabel(iso: string): string {
  const [year, month] = iso.split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Map the series onto the viewBox. Scaled to its own min/max, so small moves stay visible. */
function buildPath(series: readonly RentPoint[]): string {
  const rents = series.map((point) => point.rent);
  const min = Math.min(...rents);
  const max = Math.max(...rents);
  const range = max - min || 1;

  return series
    .map((point, index) => {
      const x = (index / Math.max(series.length - 1, 1)) * VIEWBOX_WIDTH;
      const y = VIEWBOX_HEIGHT - ((point.rent - min) / range) * VIEWBOX_HEIGHT;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function Sparkline({ series }: { readonly series: readonly RentPoint[] }) {
  if (series.length < 2) return null;

  const path = buildPath(series);
  const first = series[0];
  const last = series[series.length - 1];

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-24 w-full"
        role="img"
        aria-label={`Rent trend from ${usd(first.rent)} in ${monthLabel(first.month)} to ${usd(
          last.rent,
        )} in ${monthLabel(last.month)}`}
      >
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs opacity-60">
        <span>{monthLabel(first.month)}</span>
        <span>{monthLabel(last.month)}</span>
      </figcaption>
    </figure>
  );
}

/**
 * Area rent for the building's ZIP.
 *
 * Labelled "area rent" throughout on purpose: ZORI is a ZIP-level index, so it
 * describes the neighbourhood, not this apartment. The projection prints its own
 * arithmetic so nobody mistakes straight-line extrapolation for a forecast.
 */
export function RentTrend({ source }: { readonly source: SourceValue<AreaRent> }) {
  if (source.value === null) {
    return (
      <section className="rounded-xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="text-xs font-medium uppercase tracking-wide opacity-60">Area rent</h2>
        <div className="mt-1 text-2xl font-semibold opacity-50">Unavailable</div>
        <p className="mt-1 text-sm opacity-60">{source.error}</p>
      </section>
    );
  }

  const rent = source.value;
  const rising = (rent.yearOverYearPct ?? 0) > 0;

  return (
    <section className="rounded-xl border border-black/10 p-6 dark:border-white/15">
      <h2 className="text-xs font-medium uppercase tracking-wide opacity-60">
        Area rent — ZIP {rent.zip}
      </h2>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-4xl font-semibold tabular-nums">{usd(rent.latest.rent)}</span>
        <span className="text-sm opacity-60">/ month · {monthLabel(rent.latest.month)}</span>
      </div>

      {rent.yearOverYearPct !== null && (
        <p className="mt-2 text-sm">
          <span className={rising ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>
            {rising ? '▲' : '▼'} {Math.abs(rent.yearOverYearPct).toFixed(1)}%
          </span>
          <span className="opacity-70"> over the last 12 months</span>
        </p>
      )}

      <Sparkline series={rent.series} />

      {rent.projectedNextYear !== null && (
        <div className="mt-4 rounded-md border border-black/10 p-3 dark:border-white/15">
          <div className="text-xs uppercase tracking-wide opacity-60">
            Same rate, one year out
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {usd(rent.projectedNextYear)}
          </div>
        </div>
      )}

      {/* Product rule: the method is printed, never hidden behind the number. */}
      <p className="mt-3 text-xs leading-snug opacity-60">{rent.method}</p>

      <p className="mt-2 text-xs opacity-60">
        This is the neighbourhood index for the whole ZIP, not this building&apos;s rent.{' '}
        <a
          href="https://www.zillow.com/research/data/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Zillow Observed Rent Index
        </a>
      </p>
    </section>
  );
}
