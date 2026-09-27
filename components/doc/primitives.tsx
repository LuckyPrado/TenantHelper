import type { ReactNode } from 'react';

/*
 * Primitives for the record sheet.
 *
 * The structural device is the RULE, not the box. A municipal form separates
 * sections with lines and leading; it does not chop itself into a grid of
 * identical rounded cards with the same shadow under each. Using rules also
 * lets the page stay dense — which matters, because the whole argument of this
 * product is that the numbers belong next to each other.
 */

export function Sheet({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`sheet ${className}`}>{children}</div>;
}

/**
 * A titled block. The title sits on the rule rather than floating above it as
 * a tracked-out all-caps eyebrow, which is the generic treatment.
 */
export function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rule px-5 py-4 sm:px-7 sm:py-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[0.95rem] font-600 tracking-tight text-ink">{title}</h2>
        {aside !== undefined && <div className="text-[0.75rem] text-ink-faint">{aside}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * One label/value line. `note` carries the meaning of the figure — "immediately
 * hazardous" does more work than the number alone.
 */
export function Row({
  label,
  note,
  value,
  tone = 'ink',
  source,
}: {
  label: string;
  note?: string;
  value: ReactNode;
  tone?: 'ink' | 'a' | 'b' | 'c' | 'clear' | 'faint';
  source?: { href: string; label: string };
}) {
  const toneClass = {
    ink: 'text-ink',
    a: 'text-class-a',
    b: 'text-class-b',
    c: 'text-class-c',
    clear: 'text-clear',
    faint: 'text-ink-faint',
  }[tone];

  return (
    <div className="flex items-baseline gap-3 border-b border-paper-edge/60 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <span className="text-[0.9rem] text-ink">{label}</span>
        {note !== undefined && <span className="ml-2 text-[0.78rem] text-ink-faint">{note}</span>}
        {source !== undefined && (
          <a
            href={source.href}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-[0.72rem] text-ink-faint underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            {source.label}
          </a>
        )}
      </div>
      <div className={`tabular shrink-0 text-[1.05rem] font-600 ${toneClass}`} data-numeric>
        {value}
      </div>
    </div>
  );
}

/** A stamped classification, as printed on the notice itself. */
export function Stamp({
  children,
  tone = 'ink',
}: {
  children: ReactNode;
  tone?: 'ink' | 'c' | 'b' | 'clear';
}) {
  const toneClass = {
    ink: 'text-ink',
    c: 'text-class-c',
    b: 'text-class-b',
    clear: 'text-clear',
  }[tone];
  return <span className={`stamp text-[0.7rem] ${toneClass}`}>{children}</span>;
}

/** Serial numbers. Monospace earns its place here and nowhere else. */
export function Serial({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[0.78rem] text-ink-soft">{children}</span>;
}

/** A value we could not obtain, which is never the same as zero. */
export function Unknown({ reason }: { reason: string | null }) {
  return (
    <span className="text-[0.85rem] font-400 text-ink-faint" title={reason ?? undefined}>
      not available
    </span>
  );
}
