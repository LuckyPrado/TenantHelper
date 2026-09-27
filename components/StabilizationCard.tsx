import { nextOrderAfter, orderForLeaseStart } from '@/lib/nyc/rgb';
import type { SourceValue } from '@/lib/nyc/report';
import { SOURCE_REPO_URL, type StabilizationStatus } from '@/lib/nyc/stabilized';
import type { AreaRent } from '@/lib/nyc/zori';

function pct(value: number): string {
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function Caps({ today }: { readonly today: Date }) {
  const current = orderForLeaseStart(today);
  const next = nextOrderAfter(today);

  if (current === null && next === null) {
    return (
      <p className="mt-3 text-sm opacity-70">
        No published Rent Guidelines Board order covers today&apos;s date.
      </p>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {[current, next].map((order, index) =>
        order === null ? null : (
          <div
            key={order.order}
            className={`rounded-md border p-3 ${
              index === 1
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-black/10 dark:border-white/15'
            }`}
          >
            <div className="text-xs uppercase tracking-wide opacity-60">
              {index === 1 ? 'Leases from ' : 'Leases until '}
              {new Date(index === 1 ? order.startsOn : order.endsOn).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{pct(order.oneYearPct)}</div>
            <div className="text-xs opacity-70">
              1-year renewal · {pct(order.twoYearPct)} for 2-year
            </div>
            <a
              href={order.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs underline opacity-50 hover:opacity-100"
            >
              RGB Order #{order.order}
            </a>
          </div>
        ),
      )}
    </div>
  );
}

interface StabilizationCardProps {
  readonly source: SourceValue<StabilizationStatus>;
  readonly areaRent: SourceValue<AreaRent>;
  readonly today?: Date;
}

/**
 * Rent stabilization status and, when stabilized, the legal increase cap.
 *
 * This is the one place the app can state a future rent figure with confidence:
 * a RGB order is a published rule, not an extrapolation. The contrast against
 * the ZORI area trend is the point — it is what the status is worth to a tenant.
 */
export function StabilizationCard({ source, areaRent, today = new Date() }: StabilizationCardProps) {
  if (source.value === null) {
    return (
      <section className="rounded-xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="text-xs font-medium uppercase tracking-wide opacity-60">
          Rent stabilization
        </h2>
        <div className="mt-1 text-2xl font-semibold opacity-50">Unavailable</div>
        <p className="mt-1 text-sm opacity-60">{source.error}</p>
      </section>
    );
  }

  const { isStabilized, buildingClass } = source.value;
  const areaTrendPct = areaRent.value?.yearOverYearPct ?? null;
  const cap = orderForLeaseStart(today) ?? nextOrderAfter(today);

  return (
    <section
      className={`rounded-xl border p-6 ${
        isStabilized
          ? 'border-emerald-500/50 bg-emerald-500/5'
          : 'border-black/10 dark:border-white/15'
      }`}
    >
      <h2 className="text-xs font-medium uppercase tracking-wide opacity-60">Rent stabilization</h2>
      <div className="mt-1 text-2xl font-semibold">
        {isStabilized ? 'Likely rent stabilized' : 'Not on the stabilized list'}
      </div>

      {isStabilized ? (
        <>
          <p className="mt-2 text-sm opacity-80">
            Your renewal increase is capped by the Rent Guidelines Board.
            {buildingClass !== null && (
              <span className="opacity-60"> Listed as {buildingClass.toLowerCase()}.</span>
            )}
          </p>

          <Caps today={today} />

          {areaTrendPct !== null && cap !== null && areaTrendPct > cap.oneYearPct && (
            <p className="mt-4 rounded-md border border-black/10 p-3 text-sm dark:border-white/15">
              Area rents rose <strong>{areaTrendPct.toFixed(1)}%</strong> over the last year, but a
              stabilized renewal here is capped at <strong>{pct(cap.oneYearPct)}</strong>. That gap
              is what the status is worth to you.
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm opacity-80">
          This building does not appear on the community-maintained stabilized list, so a renewal
          increase is most likely set by the market rather than capped. Absence from the list is not
          proof — buildings can be missing or newly registered.
        </p>
      )}

      <p className="mt-4 text-xs leading-snug opacity-60">
        Community-sourced and unofficial, built from Rent Guidelines Board filings by{' '}
        <a
          href={SOURCE_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          firstmovernyc/nyc-rent-stabilized-listings
        </a>
        . It may contain errors and is not legal advice. Confirm your own status with a DHCR rent
        history request.
      </p>
    </section>
  );
}
