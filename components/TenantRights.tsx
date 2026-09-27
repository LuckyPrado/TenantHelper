import type { TenantRight } from '@/lib/rights';

/**
 * Rights selected by this building's record.
 *
 * Each entry says why it appeared, so the section reads as a response to this
 * building rather than boilerplate. Nothing here is model-generated — wrong
 * housing law is worse than none.
 */
export function TenantRights({ rights }: { readonly rights: readonly TenantRight[] }) {
  if (rights.length === 0) return null;

  return (
    <section className="rounded-xl border border-black/10 p-6 dark:border-white/15">
      <h2 className="text-xs font-medium uppercase tracking-wide opacity-60">
        What you can do about it
      </h2>
      <p className="mt-1 text-sm opacity-70">
        Selected from this building&apos;s record — not a generic checklist.
      </p>

      <ul className="mt-4 space-y-5">
        {rights.map((right) => (
          <li key={right.id} className="border-l-2 border-black/15 pl-4 dark:border-white/20">
            <h3 className="text-sm font-semibold">{right.title}</h3>
            <p className="mt-0.5 text-xs uppercase tracking-wide opacity-50">
              Shown because: {right.because}
            </p>
            <p className="mt-2 text-sm leading-relaxed opacity-85">{right.summary}</p>
            <p className="mt-2 text-sm leading-relaxed">
              <span className="font-medium">What to do: </span>
              <span className="opacity-85">{right.action}</span>
            </p>
            <a
              href={right.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs underline opacity-50 hover:opacity-100"
            >
              {right.sourceLabel}
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs leading-snug opacity-60">
        General information from official NYC sources, not legal advice. For advice about your own
        situation, speak to a tenant lawyer or a housing counsellor.
      </p>
    </section>
  );
}
