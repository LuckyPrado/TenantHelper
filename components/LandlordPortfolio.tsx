import Link from 'next/link';
import type { Landlord } from '@/lib/nyc/landlord';
import type { SourceValue } from '@/lib/nyc/report';

const ROLE_LABELS: Readonly<Record<string, string>> = {
  agent: 'Managing agent',
  headofficer: 'Head officer',
  corporateowner: 'Corporate owner',
  sitemanager: 'Site manager',
  individualowner: 'Individual owner',
  officer: 'Officer',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role.toLowerCase()] ?? role;
}

/**
 * The landlord and their other buildings.
 *
 * Facts only — counts and addresses, no grade. The landlord rating was shelved
 * because no rating data exists; inventing one would be the same black box the
 * product rules forbid.
 */
export function LandlordPortfolio({
  source,
  currentBbl,
}: {
  readonly source: SourceValue<Landlord>;
  readonly currentBbl: string;
}) {
  if (source.value === null) {
    return (
      <section className="rounded-xl border border-black/10 p-6 dark:border-white/15">
        <h2 className="text-xs font-medium uppercase tracking-wide opacity-60">Landlord</h2>
        <div className="mt-1 text-2xl font-semibold opacity-50">Unavailable</div>
        <p className="mt-1 text-sm opacity-60">{source.error}</p>
      </section>
    );
  }

  const { contacts, portfolioKey, portfolio, portfolioOpenViolations, truncated } = source.value;
  const others = portfolio.filter((b) => b.bbl !== currentBbl);

  return (
    <section className="rounded-xl border border-black/10 p-6 dark:border-white/15">
      <h2 className="text-xs font-medium uppercase tracking-wide opacity-60">Landlord</h2>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {contacts.slice(0, 4).map((contact) => (
          <div key={`${contact.role}-${contact.name}`}>
            <dt className="text-xs uppercase tracking-wide opacity-60">{roleLabel(contact.role)}</dt>
            <dd className="text-sm font-medium">{contact.name}</dd>
          </div>
        ))}
      </dl>

      {portfolioKey !== null && others.length > 0 && (
        <>
          <div className="mt-6 rounded-md border border-amber-500/50 bg-amber-500/5 p-4">
            <div className="text-sm">
              <strong>{portfolioKey.name}</strong> also runs{' '}
              <strong>
                {others.length}
                {truncated && '+'} other {others.length === 1 ? 'building' : 'buildings'}
              </strong>
              {portfolioOpenViolations !== null && (
                <>
                  {' '}
                  with{' '}
                  <strong>{portfolioOpenViolations.toLocaleString()} open violations</strong> between
                  them
                </>
              )}
              .
            </div>
            <p className="mt-1 text-xs opacity-60">
              Found by matching the HPD {roleLabel(portfolioKey.role).toLowerCase()}, not the owning
              LLC — NYC landlords register one company per building, so the owner name finds only
              this one.
            </p>
          </div>

          <ul className="mt-4 divide-y divide-black/10 dark:divide-white/10">
            {others.slice(0, 10).map((building) => (
              <li key={building.bbl} className="flex items-center justify-between gap-4 py-2">
                <Link
                  href={{ pathname: `/building/${building.bbl}` }}
                  className="truncate text-sm underline decoration-dotted underline-offset-2 hover:decoration-solid"
                >
                  {building.address || `BBL ${building.bbl}`}
                </Link>
                <span className="shrink-0 text-sm tabular-nums opacity-70">
                  {building.openViolations === null
                    ? '—'
                    : `${building.openViolations.toLocaleString()} open`}
                </span>
              </li>
            ))}
          </ul>

          {others.length > 10 && (
            <p className="mt-2 text-xs opacity-60">
              Showing the 10 with the most open violations, of {others.length}
              {truncated && '+'}.
            </p>
          )}
        </>
      )}

      {portfolioKey !== null && others.length === 0 && (
        <p className="mt-4 text-sm opacity-70">
          No other buildings found under {portfolioKey.name}.
        </p>
      )}

      <p className="mt-4 text-xs opacity-60">
        From HPD property registrations.{' '}
        <a
          href="https://data.cityofnewyork.us/d/tesw-yqqr"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Registrations
        </a>{' '}
        ·{' '}
        <a
          href="https://data.cityofnewyork.us/d/feu5-w2e2"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Contacts
        </a>
      </p>
    </section>
  );
}
