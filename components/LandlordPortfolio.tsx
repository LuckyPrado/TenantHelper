import Link from 'next/link';
import type { Landlord } from '@/lib/nyc/landlord';
import type { SourceValue } from '@/lib/nyc/report';
import { Section } from './doc/primitives';

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
 * Who runs the building and what else they run.
 *
 * Facts only — counts and addresses, no grade. The landlord rating was shelved
 * because no rating data exists; deriving one would be the black box the
 * product rules forbid. 1,697 open violations across a portfolio speaks for
 * itself without an adjective.
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
      <Section title="Ownership">
        <p className="text-[0.88rem] text-ink-faint">{source.error}</p>
      </Section>
    );
  }

  const { contacts, portfolioKey, portfolio, portfolioOpenViolations, truncated } = source.value;
  const others = portfolio.filter((building) => building.bbl !== currentBbl);

  return (
    <Section title="Ownership">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        {contacts.slice(0, 4).map((contact) => (
          <div key={`${contact.role}-${contact.name}`} className="flex items-baseline gap-2">
            <dt className="shrink-0 text-[0.78rem] text-ink-faint">{roleLabel(contact.role)}</dt>
            <dd className="min-w-0 truncate text-[0.88rem] font-500 text-ink">{contact.name}</dd>
          </div>
        ))}
      </dl>

      {portfolioKey !== null && others.length > 0 && (
        <>
          <p className="rule mt-4 pt-3 text-[0.95rem] leading-snug text-ink">
            <span className="font-600">{portfolioKey.name}</span> also runs{' '}
            <span className="tabular font-600" data-numeric>
              {others.length}
              {truncated && '+'}
            </span>{' '}
            other {others.length === 1 ? 'building' : 'buildings'}
            {portfolioOpenViolations !== null && (
              <>
                , with{' '}
                <span className="tabular font-700 text-class-c" data-numeric>
                  {portfolioOpenViolations.toLocaleString()}
                </span>{' '}
                open violations between them
              </>
            )}
            .
          </p>
          <p className="mt-1 text-[0.75rem] leading-snug text-ink-faint">
            Matched on the {roleLabel(portfolioKey.role).toLowerCase()} rather than the owning
            company. NYC landlords register one company per building, so the owner name finds only
            this one.
          </p>

          <ul className="mt-3">
            {others.slice(0, 8).map((building) => (
              <li
                key={building.bbl}
                className="flex items-baseline justify-between gap-4 border-b border-paper-edge/60 py-1.5 last:border-b-0"
              >
                <Link
                  href={{ pathname: `/building/${building.bbl}` }}
                  className="min-w-0 truncate text-[0.88rem] text-ink underline decoration-dotted underline-offset-2 hover:decoration-solid"
                >
                  {building.address || `Tax lot ${building.bbl}`}
                </Link>
                <span className="tabular shrink-0 text-[0.88rem] font-600 text-ink-soft" data-numeric>
                  {building.openViolations === null ? '—' : building.openViolations.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>

          {others.length > 8 && (
            <p className="mt-2 text-[0.75rem] text-ink-faint">
              The eight with the most open violations, of {others.length}
              {truncated && '+'}.
            </p>
          )}
        </>
      )}

      {portfolioKey !== null && others.length === 0 && (
        <p className="rule mt-4 pt-3 text-[0.88rem] text-ink-soft">
          No other buildings found under {portfolioKey.name}.
        </p>
      )}

      <p className="mt-3 text-[0.75rem] text-ink-faint">
        From HPD property registrations —{' '}
        <a
          href="https://data.cityofnewyork.us/d/tesw-yqqr"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          registrations
        </a>{' '}
        and{' '}
        <a
          href="https://data.cityofnewyork.us/d/feu5-w2e2"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          contacts
        </a>
        .
      </p>
    </Section>
  );
}
