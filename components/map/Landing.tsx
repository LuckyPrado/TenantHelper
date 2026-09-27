'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * Everything that floats over the city on the landing screen.
 *
 * One job: take an address and go. The overlay fades as the search resolves so
 * the city is already clear by the time the camera starts moving.
 */
export function Landing() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const address = query.trim();
    if (address === '' || searching) return;

    setSearching(true);
    setError(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
      const body = (await response.json()) as
        | { ok: true; bbl: string; bin: string | null; label: string }
        | { ok: false; reason: string };

      if (!body.ok) {
        setError(body.reason);
        setSearching(false);
        return;
      }

      // Fade first, then navigate, so the city is already clear as the camera
      // begins to move.
      setLeaving(true);
      const params = new URLSearchParams({ label: body.label });
      if (body.bin !== null) params.set('bin', body.bin);
      setTimeout(() => router.push(`/building/${body.bbl}?${params.toString()}`), 420);
    } catch {
      setError('Could not reach the address service.');
      setSearching(false);
    }
  }

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-10 transition-opacity duration-500 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <nav className="pointer-events-auto absolute top-0 left-0 p-4 sm:p-6">
        <Link
          href="/rights"
          className="border border-ink/30 bg-city-deep/70 px-3 py-1.5 text-[0.82rem] text-ink backdrop-blur-sm transition-colors hover:border-ink hover:bg-ink hover:text-city-deep"
        >
          Know your rights
        </Link>
      </nav>

      {/* The city is busy with street labels, so the centre content needs its
          own ground to sit on. A soft radial scrim darkens just behind the
          type without flattening the map or hiding the skyline. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 58% 46% at 50% 46%, rgba(7,10,14,0.93) 0%, rgba(7,10,14,0.74) 45%, rgba(7,10,14,0) 100%)',
        }}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5">
        <div className="pointer-events-auto w-full max-w-xl text-center">
          <h1 className="font-display text-[2.9rem] leading-[0.95] font-700 tracking-[-0.035em] text-ink sm:text-[4.6rem]">
            Know Your Building
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[0.98rem] leading-relaxed text-ink-soft">
            Every building in New York has a public record. Read it before you sign the lease.
          </p>

          <form onSubmit={search} className="mt-8 flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="609 West 180 Street Manhattan"
              aria-label="NYC street address"
              className="flex-1 border border-ink/35 bg-city-deep/80 px-4 py-3 text-[1rem] text-ink backdrop-blur-sm placeholder:text-ink-faint focus:border-ink focus:outline-none"
            />
            <button
              type="submit"
              disabled={searching}
              className="border border-ink bg-ink px-7 py-3 text-[1rem] font-600 text-city-deep transition-colors hover:bg-transparent hover:text-ink disabled:opacity-60"
            >
              {searching ? 'Finding…' : 'Search'}
            </button>
          </form>

          {error !== null && <p className="mt-3 text-[0.85rem] text-class-c">{error}</p>}
        </div>
      </div>
    </div>
  );
}
