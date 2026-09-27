import { nextOrderAfter, orderForLeaseStart } from '@/lib/nyc/rgb';
import type { SourceValue } from '@/lib/nyc/report';
import { SOURCE_REPO_URL, type StabilizationStatus } from '@/lib/nyc/stabilized';
import type { AreaRent } from '@/lib/nyc/zori';
import { Section, Stamp } from './doc/primitives';

function pct(value: number): string {
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

interface StabilizationCardProps {
  readonly source: SourceValue<StabilizationStatus>;
  readonly areaRent: SourceValue<AreaRent>;
  readonly today?: Date;
}

/**
 * Stabilization status and, when it applies, the legal ceiling on a renewal.
 *
 * The only place this product states a future rent with confidence: a Rent
 * Guidelines Board order is a published rule, not an extrapolation. The gap
 * between that ceiling and the area trend is what the status is actually worth.
 */
export function StabilizationCard({ source, areaRent, today = new Date() }: StabilizationCardProps) {
  if (source.value === null) {
    return (
      <Section title="Rent regulation">
        <p className="text-[0.88rem] text-ink-faint">{source.error}</p>
      </Section>
    );
  }

  const { isStabilized, buildingClass } = source.value;
  const areaTrendPct = areaRent.value?.yearOverYearPct ?? null;
  const current = orderForLeaseStart(today);
  const next = nextOrderAfter(today);
  const cap = current ?? next;

  if (!isStabilized) {
    return (
      <Section title="Rent regulation">
        <p className="text-[0.9rem] text-ink-soft">
          This building is not on the rent stabilized list, so a renewal increase is most likely set
          by the market rather than capped. Absence is not proof — buildings can be missing or newly
          registered.
        </p>
        <p className="mt-3 text-[0.75rem] leading-snug text-ink-faint">
          Community-sourced and unofficial, from{' '}
          <a
            href={SOURCE_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            firstmovernyc
          </a>
          , built on Rent Guidelines Board filings. Not legal advice.
        </p>
      </Section>
    );
  }

  return (
    <Section title="Rent regulation" aside={<Stamp tone="clear">Stabilized</Stamp>}>
      <p className="text-[0.9rem] text-ink-soft">
        Renewal increases here are capped by the Rent Guidelines Board.
        {buildingClass !== null && ` Listed as ${buildingClass.toLowerCase()}.`}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-px bg-paper-edge sm:grid-cols-2">
        {[current, next].map((order, index) =>
          order === null ? null : (
            <div key={order.order} className="bg-paper px-4 py-3">
              <div className="text-[0.75rem] text-ink-faint">
                {index === 1
                  ? `Leases from ${shortDate(order.startsOn)}`
                  : `Leases until ${shortDate(order.endsOn)}`}
              </div>
              <div className="tabular mt-1 text-[1.9rem] leading-none font-700 text-ink" data-numeric>
                {pct(order.oneYearPct)}
              </div>
              <div className="mt-1 text-[0.75rem] text-ink-faint">
                one-year renewal · {pct(order.twoYearPct)} for two
              </div>
              <a
                href={order.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-[0.7rem] text-ink-faint underline decoration-dotted underline-offset-2 hover:text-ink"
              >
                Order #{order.order}
              </a>
            </div>
          ),
        )}
      </div>

      {areaTrendPct !== null && cap !== null && areaTrendPct > cap.oneYearPct && (
        <p className="rule mt-4 pt-3 text-[0.9rem] text-ink-soft">
          Rents across the ZIP rose{' '}
          <span className="tabular font-600 text-class-b" data-numeric>
            {areaTrendPct.toFixed(1)}%
          </span>{' '}
          last year. A stabilized renewal here is capped at{' '}
          <span className="tabular font-600 text-clear" data-numeric>
            {pct(cap.oneYearPct)}
          </span>
          . That gap is what the status is worth to you.
        </p>
      )}

      <p className="mt-3 text-[0.75rem] leading-snug text-ink-faint">
        Community-sourced and unofficial, from{' '}
        <a
          href={SOURCE_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          firstmovernyc
        </a>
        , built on Rent Guidelines Board filings. It may contain errors and is not legal advice —
        confirm with a DHCR rent history request.
      </p>
    </Section>
  );
}
