import Link from 'next/link';
import { Sheet } from '@/components/doc/primitives';
import {
  HPD_TENANT_RIGHTS_URL,
  RIGHTS_GROUPS,
  allTopics,
  type RightsTopic,
} from '@/lib/tenantRights';

export const metadata = {
  title: 'Tenant rights in New York City — Know Your Building',
  description:
    "What a landlord owes you, what they may never do, and where to complain. Transcribed from HPD's own guidance.",
};

function Topic({ topic }: { readonly topic: RightsTopic }) {
  return (
    <article className="border-t border-paper-edge py-5 first:border-t-0 first:pt-0">
      <h3 className="font-display text-[1.05rem] font-600 tracking-tight text-ink">
        {topic.title}
      </h3>
      <p className="mt-1 text-[0.95rem] leading-snug text-ink">{topic.headline}</p>

      <div className="mt-3 space-y-2">
        {topic.detail.map((line) => (
          <p key={line.slice(0, 40)} className="text-[0.88rem] leading-relaxed text-ink-soft">
            {line}
          </p>
        ))}
      </div>

      {topic.statute !== undefined && (
        <p className="tabular mt-3 text-[0.75rem] text-ink-faint">{topic.statute}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {topic.sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.78rem] text-ink-faint underline decoration-dotted underline-offset-2 hover:text-ink hover:decoration-solid"
          >
            {source.label}
          </a>
        ))}
      </div>
    </article>
  );
}

export default function RightsPage() {
  const count = allTopics().length;

  return (
    <div className="min-h-screen">
      <main className="relative z-10 mx-auto w-full max-w-3xl pb-16">
        {/* The same window onto the city the record leaves above itself. */}
        <div className="h-[22vh] min-h-[130px] sm:h-[26vh]" aria-hidden />

        <Sheet className="relative">
          <nav className="px-5 pt-5 sm:px-7">
            <Link
              href="/"
              className="text-[0.85rem] text-ink-faint underline underline-offset-2 hover:text-ink"
            >
              ← Search an address
            </Link>
          </nav>

          <header className="px-5 pt-4 pb-5 sm:px-7">
            <h1 className="font-display text-[2rem] leading-tight font-700 tracking-[-0.02em] text-ink sm:text-[2.7rem]">
              Your rights as a tenant
            </h1>
            <p className="mt-3 max-w-2xl text-[0.98rem] leading-relaxed text-ink-soft">
              {count} things a New York City landlord owes you, what they may never do, and where
              to complain when they do it anyway. Every line is taken from the city&apos;s own
              guidance and links back to it.
            </p>
            <p className="mt-3 max-w-2xl text-[0.82rem] leading-relaxed text-ink-faint">
              A summary of{' '}
              <a
                href={HPD_TENANT_RIGHTS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                HPD&apos;s Tenants&apos; Rights and Responsibilities
              </a>
              , read 27 September 2026. It is not legal advice, and it is not a substitute for
              talking to a lawyer or to HPD.
            </p>
          </header>

          {RIGHTS_GROUPS.map((group) => (
            <section key={group.id} className="rule px-5 py-6 sm:px-7">
              <h2 className="font-display text-[1.3rem] font-700 tracking-tight text-ink">
                {group.title}
              </h2>
              <p className="mt-1 text-[0.85rem] text-ink-faint">{group.blurb}</p>
              <div className="mt-5">
                {group.topics.map((topic) => (
                  <Topic key={topic.id} topic={topic} />
                ))}
              </div>
            </section>
          ))}

          <footer className="rule px-5 py-6 sm:px-7">
            <p className="text-[0.88rem] leading-relaxed text-ink-soft">
              Emergencies, and most complaints, go to 311 —{' '}
              <a
                href="https://portal.311.nyc.gov/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                portal.311.nyc.gov
              </a>{' '}
              or dial 311. A complaint on the record is what turns into the violation counts this
              site reads back to you.
            </p>
            <p className="mt-4 text-[0.78rem] leading-relaxed text-ink-faint">
              Nothing on this page was written by a model. It is fixed text transcribed from HPD,
              because wrong housing law is worse than no housing law.
            </p>
          </footer>
        </Sheet>
      </main>
    </div>
  );
}
