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
      <span className="w-5 shrink-0 text-right text-xs tabular-nums opacity-40">{rank}</span>
      <div className="min-w-0 flex-1">
        <Link
          href={{ pathname: `/building/${entry.bbl}` }}
          className="block truncate text-sm underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          {entry.address || `BBL ${entry.bbl}`}
        </Link>
        <span className="text-xs opacity-60">
          {entry.unitsRes.toLocaleString()} units · {entry.openViolations.toLocaleString()} open
        </span>
      </div>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
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
      className={`rounded-xl border p-5 ${
        tone === 'bad' ? 'border-red-500/40 bg-red-500/5' : 'border-emerald-500/40 bg-emerald-500/5'
      }`}
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-0.5 text-xs opacity-60">{subtitle}</p>
      <ol className="mt-2 divide-y divide-black/10 dark:divide-white/10">
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
      <Link href="/" className="text-sm underline opacity-60 hover:opacity-100">
        ← Search an address
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        Best and worst buildings in {zip}
      </h1>
      <p className="mt-1 text-sm opacity-70">
        Ranked by open HPD violations per apartment, so a small bad building is not hidden behind a
        large average one. Buildings under 6 units are excluded — one violation swings their rate
        too far.
      </p>

      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {SUGGESTED.map((option) => (
          <Link
            key={option.zip}
            href={{ pathname: '/leaderboard', query: { zip: option.zip } }}
            className={`rounded-full border px-3 py-1 ${
              option.zip === zip
                ? 'border-transparent bg-foreground text-background'
                : 'border-black/15 hover:border-black/40 dark:border-white/20 dark:hover:border-white/50'
            }`}
          >
            {option.zip} · {option.label}
          </Link>
        ))}
      </nav>

      {!result.ok ? (
        <p className="mt-8 rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm">
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
              <div key={label} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
                <dt className="text-xs uppercase tracking-wide opacity-60">{label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
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

          <p className="mt-6 text-xs opacity-60">
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
