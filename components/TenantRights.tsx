import type { TenantRight } from '@/lib/rights';
import { Section } from './doc/primitives';

/**
 * Rights selected by this building's record.
 *
 * Each entry says why it appeared, so the section reads as a response to this
 * building rather than a leaflet. Nothing here is model-generated — wrong
 * housing law is worse than none.
 */
export function TenantRights({ rights }: { readonly rights: readonly TenantRight[] }) {
  if (rights.length === 0) return null;

  return (
    <Section title="What you can do about it" aside="Selected from this record">
      <ul className="space-y-4">
        {rights.map((right) => (
          <li key={right.id} className="border-l-2 border-ink pl-4">
            <h3 className="text-[0.92rem] font-600 leading-snug text-ink">{right.title}</h3>
            <p className="mt-0.5 text-[0.75rem] text-ink-faint">Shown because {right.because}</p>
            <p className="mt-1.5 text-[0.88rem] leading-relaxed text-ink-soft">{right.summary}</p>
            <p className="mt-1.5 text-[0.88rem] leading-relaxed text-ink-soft">
              <span className="font-600 text-ink">What to do: </span>
              {right.action}
            </p>
            <a
              href={right.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-[0.72rem] text-ink-faint underline decoration-dotted underline-offset-2 hover:text-ink"
            >
              {right.sourceLabel}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.75rem] leading-snug text-ink-faint">
        General information from official NYC sources, not legal advice. For your own situation,
        speak to a tenant lawyer or a housing counsellor.
      </p>
    </Section>
  );
}
