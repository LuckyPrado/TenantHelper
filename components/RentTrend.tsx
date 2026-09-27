import type { SourceValue } from '@/lib/nyc/report';
import type { AreaRent, RentPoint } from '@/lib/nyc/zori';
import { Section } from './doc/primitives';

const VIEWBOX_WIDTH = 600;
const VIEWBOX_HEIGHT = 90;

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

/** Scaled to its own min/max so small moves stay visible. */
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

  const first = series[0];
  const last = series[series.length - 1];

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-20 w-full text-ink"
        role="img"
        aria-label={`Rent trend from ${usd(first.rent)} in ${monthLabel(first.month)} to ${usd(
          last.rent,
        )} in ${monthLabel(last.month)}`}
      >
        <path
          d={buildPath(series)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="mt-1 flex justify-between text-[0.72rem] text-ink-faint">
        <span>{monthLabel(first.month)}</span>
        <span>{monthLabel(last.month)}</span>
      </figcaption>
    </figure>
  );
}

/**
 * Area rent for the building's ZIP.
 *
 * Labelled "area" throughout on purpose: ZORI is a ZIP-level index, so it
 * describes the neighbourhood and not this apartment. The projection prints its
 * own arithmetic rather than hiding behind the number.
 */
export function RentTrend({ source }: { readonly source: SourceValue<AreaRent> }) {
  if (source.value === null) {
    return (
      <Section title="Area rent">
        <p className="text-[0.88rem] text-ink-faint">{source.error}</p>
      </Section>
    );
  }

  const rent = source.value;
  const rising = (rent.yearOverYearPct ?? 0) > 0;

  return (
    <Section title="Area rent" aside={`ZIP ${rent.zip}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular font-display text-[2.4rem] leading-none font-700 tracking-tight text-ink" data-numeric>
          {usd(rent.latest.rent)}
        </span>
        <span className="text-[0.85rem] text-ink-soft">
          a month, {monthLabel(rent.latest.month)}
        </span>
      </div>

      {rent.yearOverYearPct !== null && (
        <p className="mt-1.5 text-[0.88rem] text-ink-soft">
          <span className={`tabular font-600 ${rising ? 'text-class-b' : 'text-clear'}`} data-numeric>
            {rising ? 'Up' : 'Down'} {Math.abs(rent.yearOverYearPct).toFixed(1)}%
          </span>{' '}
          over the last twelve months.
        </p>
      )}

      <Sparkline series={rent.series} />

      {rent.projectedNextYear !== null && (
        <div className="rule mt-4 flex items-baseline justify-between gap-4 pt-3">
          <span className="text-[0.88rem] text-ink-soft">At the same rate, a year from now</span>
          <span className="tabular text-[1.3rem] font-600 text-ink" data-numeric>
            {usd(rent.projectedNextYear)}
          </span>
        </div>
      )}

      <p className="mt-3 text-[0.75rem] leading-snug text-ink-faint">
        {rent.method} This is the index for the whole ZIP code, not this building&apos;s rent.{' '}
        <a
          href="https://www.zillow.com/research/data/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          Zillow Observed Rent Index
        </a>
      </p>
    </Section>
  );
}
