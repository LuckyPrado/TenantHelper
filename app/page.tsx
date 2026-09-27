import Link from 'next/link';
import { geocodeAddress } from '@/lib/nyc/geosearch';

export const metadata = {
  title: 'Is this building any good? — NYC tenant report',
};

const EXAMPLES = [
  { label: '609 W 180 St', query: '609 West 180 Street Manhattan' },
  { label: '500 W 175 St', query: '500 West 175 Street Manhattan' },
] as const;

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const { q } = await searchParams;
  const query = typeof q === 'string' ? q.trim() : '';
  const result = query.length > 0 ? await geocodeAddress(query) : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12 sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Before you sign the lease
      </h1>
      <p className="mt-3 text-base opacity-70">
        Look up any NYC address and see the building&apos;s violation record, its landlord&apos;s
        other buildings, and what the area rents for. Every figure links to the public dataset it
        came from.
      </p>

      <form action="/" method="get" className="mt-8 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          name="q"
          defaultValue={query}
          required
          placeholder="e.g. 500 West 175 Street Manhattan"
          aria-label="NYC street address"
          className="flex-1 rounded-md border border-black/15 bg-transparent px-4 py-3 text-base outline-none focus:border-black/50 dark:border-white/20 dark:focus:border-white/50"
        />
        <button
          type="submit"
          className="rounded-md bg-foreground px-5 py-3 text-base font-medium text-background"
        >
          Look up
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2 text-sm opacity-70">
        <span>Try:</span>
        {EXAMPLES.map((example) => (
          <Link
            key={example.query}
            href={{ pathname: '/', query: { q: example.query } }}
            className="underline hover:opacity-100"
          >
            {example.label}
          </Link>
        ))}
      </div>

      <p className="mt-4 text-sm opacity-70">
        Or browse{' '}
        <Link href={{ pathname: '/leaderboard' }} className="underline">
          the best and worst buildings by ZIP
        </Link>
        .
      </p>

      {result !== null && !result.ok && (
        <p className="mt-8 rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm">
          {result.reason}
        </p>
      )}

      {result !== null && result.ok && (
        <section className="mt-8 rounded-lg border border-black/10 p-5 dark:border-white/15">
          {/* The plan calls for an explicit confirmation step: GeoSearch is fuzzy
              and answers plausible-looking near misses, so the user verifies the
              match before we show them a report about someone else's building. */}
          <div className="text-xs font-medium uppercase tracking-wide opacity-60">
            Is this the right building?
          </div>
          <div className="mt-1 text-lg font-medium">{result.data.label}</div>
          <div className="mt-1 text-sm opacity-60">
            BBL {result.data.bbl}
            {result.data.zip !== null && ` · ${result.data.zip}`}
            {result.data.matchType !== null && ` · ${result.data.matchType} match`}
          </div>

          {result.data.matchType !== 'exact' && (
            <p className="mt-3 text-sm opacity-70">
              This was not an exact match. Check the address above before relying on the report.
            </p>
          )}

          <Link
            href={{
              pathname: `/building/${result.data.bbl}`,
              query: { bin: result.data.bin, label: result.data.label },
            }}
            className="mt-4 inline-block rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            See the report
          </Link>
        </section>
      )}
    </main>
  );
}
