import Link from 'next/link';
import { Serial } from '@/components/doc/primitives';
import { geocodeAddress } from '@/lib/nyc/geosearch';

export const metadata = {
  title: 'Before you sign — NYC building records',
};

const EXAMPLES = [
  { label: '609 W 180 St', query: '609 West 180 Street Manhattan', note: 'the worst one we found' },
  { label: '500 W 175 St', query: '500 West 175 Street Manhattan', note: 'rent stabilized' },
] as const;

export default async function HomePage({ searchParams }: PageProps<'/'>) {
  const { q } = await searchParams;
  const query = typeof q === 'string' ? q.trim() : '';
  const result = query.length > 0 ? await geocodeAddress(query) : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-14 sm:py-24">
      <h1 className="font-display text-[2.4rem] leading-[0.98] font-700 tracking-[-0.03em] text-ink sm:text-[3.4rem]">
        Before you sign the lease
      </h1>
      <p className="mt-4 max-w-xl text-[1rem] leading-relaxed text-ink-soft">
        Every NYC building has a public record — violations, housing court, evictions, who really
        owns it. Look up an address and read it before you commit to living there.
      </p>

      <form action="/" method="get" className="mt-9 flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          name="q"
          defaultValue={query}
          required
          placeholder="500 West 175 Street Manhattan"
          aria-label="NYC street address"
          className="flex-1 border border-ink bg-paper px-4 py-3 text-[1rem] text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-offset-2 focus:outline-ink"
        />
        <button
          type="submit"
          className="border border-ink bg-ink px-6 py-3 text-[1rem] font-600 text-paper transition-colors hover:bg-paper hover:text-ink"
        >
          Look it up
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[0.85rem]">
        {EXAMPLES.map((example) => (
          <span key={example.query}>
            <Link
              href={{ pathname: '/', query: { q: example.query } }}
              className="text-ink underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              {example.label}
            </Link>
            <span className="ml-1.5 text-ink-faint">{example.note}</span>
          </span>
        ))}
        <Link
          href={{ pathname: '/leaderboard' }}
          className="text-ink underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          Best and worst by ZIP
        </Link>
      </div>

      {result !== null && !result.ok && (
        <p className="rule-heavy mt-10 pt-4 text-[0.95rem] text-class-c">{result.reason}</p>
      )}

      {result !== null && result.ok && (
        <section className="rule-heavy mt-10 pt-5">
          {/* GeoSearch is fuzzy and will answer a near miss confidently, so the
              match is confirmed before we show a report about someone else's
              building. */}
          <div className="text-[1.15rem] font-600 text-ink">{result.data.label}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Serial>BBL {result.data.bbl}</Serial>
            {result.data.zip !== null && (
              <span className="text-[0.8rem] text-ink-faint">{result.data.zip}</span>
            )}
          </div>

          {result.data.matchType !== 'exact' && (
            <p className="mt-3 text-[0.88rem] text-ink-soft">
              This was not an exact match — check the address before relying on the report.
            </p>
          )}

          <Link
            href={{
              pathname: `/building/${result.data.bbl}`,
              query: { bin: result.data.bin, label: result.data.label },
            }}
            className="mt-5 inline-block border border-ink bg-ink px-5 py-2.5 text-[0.95rem] font-600 text-paper transition-colors hover:bg-paper hover:text-ink"
          >
            Read the record
          </Link>
        </section>
      )}

      <p className="mt-16 max-w-xl text-[0.8rem] leading-relaxed text-ink-faint">
        Built from NYC Open Data — HPD violations, housing court filings, marshals&apos; evictions,
        property registrations and PLUTO — plus Zillow&apos;s rent index. Every figure on a report
        links to the dataset it came from.
      </p>
    </main>
  );
}
