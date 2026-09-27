import Link from 'next/link';
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/nyc/leaderboard';

export const revalidate = 3600;

export const metadata = {
  title: 'Best and worst buildings by ZIP',
};

const DEFAULT_ZIP = '10033';
const SUGGESTED = [
  { zip: '10033', label: 'Washington Heights' },
  { zip: '10027', label: 'Harlem' },
  { zip: '11211', label: 'Williamsburg' },
  { zip: '10457', label: 'Tremont' },
] as const;

function Row({ entry, rank }: { readonly entry: LeaderboardEntry; readonly rank: number }) {
  return (
    <li className="flex items-baseline gap-3 py-2.5">
      <span className="tabular w-5 shrink-0 text-right text-[0.75rem] text-ink-faint">{rank}</span>
      <div className="min-w-0 flex-1">
        <Link
          href={{ pathname: `/building/${entry.bbl}` }}
          className="block truncate text-[0.92rem] text-ink underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          {entry.address || `BBL ${entry.bbl}`}
        </Link>
        <span className="text-[0.78rem] text-ink-faint">
          {entry.unitsRes.toLocaleString()} units · {entry.openViolations.toLocaleString()} open
        </span>
      </div>
      <span className="tabular shrink-0 text-[1rem] font-700 text-ink">
        {entry.openPerUnit.toFixed(2)}
      </span>
    </li>
  );
}

function Panel({
  title,
  subtitle,
  entries,
  tone,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly entries: readonly LeaderboardEntry[];
  readonly tone: 'bad' | 'good';
}) {
  return (
    <section
      className={`border p-5 ${
        tone === 'bad' ? 'border-paper-edge bg-paper' : 'border-paper-edge bg-paper'
      }`}
    >
      <h2 className="font-display text-[1rem] font-600 text-ink">{title}</h2>
      <p className="mt-0.5 text-[0.78rem] text-ink-faint">{subtitle}</p>
      <ol className="mt-2 divide-y divide-paper-edge/70">
        {entries.map((entry, index) => (
          <Row key={entry.bbl} entry={entry} rank={index + 1} />
        ))}
      </ol>
    </section>
  );
}

export default async function LeaderboardPage({ searchParams }: PageProps<'/leaderboard'>) {
  const { zip: rawZip } = await searchParams;
  const zip = typeof rawZip === 'string' && rawZip.trim() !== '' ? rawZip.trim() : DEFAULT_ZIP;
  const result = await fetchLeaderboard(zip);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:py-14">
      <Link href="/" className="text-[0.85rem] text-ink-faint underline underline-offset-2 hover:text-ink">
        ← Search an address
      </Link>

      <h1 className="font-display mt-4 text-[2rem] leading-tight font-700 tracking-[-0.02em] text-ink sm:text-[2.6rem]">
        Best and worst buildings in {zip}
      </h1>
      <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-ink-soft">
        Ranked by open HPD violations per apartment, so a small bad building is not hidden behind a
        large average one. Buildings under 6 units are excluded — one violation swings their rate
        too far.
      </p>

      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {SUGGESTED.map((option) => (
          <Link
            key={option.zip}
            href={{ pathname: '/leaderboard', query: { zip: option.zip } }}
            className={`border px-3 py-1 ${
              option.zip === zip
                ? 'border-ink bg-ink text-paper'
                : 'border-paper-edge text-ink hover:border-ink'
            }`}
          >
            {option.zip} · {option.label}
          </Link>
        ))}
      </nav>

      {!result.ok ? (
        <p className="mt-8 rounded-md border border-paper-edge bg-paper p-4 text-sm">
          {result.reason}
        </p>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ['Buildings ranked', result.data.buildingsRanked.toLocaleString()],
              ['Open violations in ZIP', result.data.totalOpenViolations.toLocaleString()],
              ['Median per apartment', result.data.medianPerUnit.toFixed(2)],
            ].map(([label, value]) => (
              <div key={label} className="border border-paper-edge bg-paper px-4 py-3">
                <dt className="text-[0.78rem] text-ink-faint">{label}</dt>
                <dd className="tabular mt-1 text-[1.6rem] font-700 text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Panel
              title="Worst"
              subtitle="Most open violations per apartment"
              entries={result.data.worst}
              tone="bad"
            />
            <Panel
              title="Best"
              subtitle="Cleanest record, largest buildings first"
              entries={result.data.best}
              tone="good"
            />
          </div>

          <p className="mt-8 text-[0.78rem] leading-relaxed text-ink-faint">
            From{' '}
            <a
              href="https://data.cityofnewyork.us/d/wvxf-dwi5"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              HPD violations
            </a>{' '}
            and{' '}
            <a
              href="https://data.cityofnewyork.us/d/64uk-42ks"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              PLUTO
            </a>
            . Condominium billing lots are excluded because they are tax records rather than
            physical buildings.
          </p>
        </>
      )}
    </main>
  );
}
