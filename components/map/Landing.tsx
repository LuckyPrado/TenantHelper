'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toggleStabilizedLayer } from '@/lib/map/store';

/**
 * Everything that floats over the city on the landing screen.
 *
 * It dissolves on any of the three ways in — searching, following a link, or
 * simply grabbing the map — so the city is never fighting the interface for
 * attention. Fading rather than unmounting keeps the layout from jumping and
 * lets the user bring it back by pressing Escape.
 */
export function Landing() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [stabilized, setStabilized] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dragging the map is one of the three entry points: the overlay yields and
  // the city is the user's. Pointer events on the map only — not on this UI.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-overlay]') !== null) return;
      setDismissed(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

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
      // starts moving.
      setDismissed(true);
      const params = new URLSearchParams({ label: body.label });
      if (body.bin !== null) params.set('bin', body.bin);
      setTimeout(() => router.push(`/building/${body.bbl}?${params.toString()}`), 420);
    } catch {
      setError('Could not reach the address service.');
      setSearching(false);
    }
  }

  function onToggleStabilized() {
    const next = !stabilized;
    setStabilized(next);
    toggleStabilizedLayer(next);
  }

  return (
    <div
      data-overlay
      className={`pointer-events-none fixed inset-0 z-10 transition-opacity duration-500 ${
        dismissed ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <nav className="pointer-events-auto absolute top-0 left-0 flex flex-wrap gap-2 p-4 sm:p-6">
        <Link
          href="/leaderboard"
          className="border border-paper/30 bg-city-deep/70 px-3 py-1.5 text-[0.82rem] text-paper backdrop-blur-sm transition-colors hover:border-paper hover:bg-paper hover:text-ink"
        >
          Best and worst by ZIP
        </Link>
        <button
          type="button"
          onClick={onToggleStabilized}
          aria-pressed={stabilized}
          className={`border px-3 py-1.5 text-[0.82rem] backdrop-blur-sm transition-colors ${
            stabilized
              ? 'border-clear bg-clear text-ink'
              : 'border-paper/30 bg-city-deep/70 text-paper hover:border-paper'
          }`}
        >
          Rent stabilized
        </button>
      </nav>

      {/* The city is busy with street labels, so the centre content needs its
          own ground to sit on. A soft radial scrim darkens just behind the
          type without flattening the map or hiding the skyline. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 48% at 50% 46%, rgba(7,10,14,0.92) 0%, rgba(7,10,14,0.72) 45%, rgba(7,10,14,0) 100%)',
        }}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5">
        <div className="pointer-events-auto w-full max-w-xl text-center" data-overlay>
          <h1 className="font-display text-[2.9rem] leading-[0.95] font-700 tracking-[-0.035em] text-paper sm:text-[4.6rem]">
            Know Your Building
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[0.98rem] leading-relaxed text-paper/85">
            Every building in New York has a public record. Read it before you sign the lease.
          </p>

          <form onSubmit={search} className="mt-8 flex flex-col gap-2 sm:flex-row">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="609 West 180 Street Manhattan"
              aria-label="NYC street address"
              className="flex-1 border border-paper/40 bg-city-deep/80 px-4 py-3 text-[1rem] text-paper backdrop-blur-sm placeholder:text-paper/40 focus:border-paper focus:outline-none"
            />
            <button
              type="submit"
              disabled={searching}
              className="border border-paper bg-paper px-7 py-3 text-[1rem] font-600 text-ink transition-colors hover:bg-transparent hover:text-paper disabled:opacity-60"
            >
              {searching ? 'Finding…' : 'Search'}
            </button>
          </form>

          {error !== null && (
            <p className="mt-3 text-[0.85rem] text-paper/90">
              {error}
            </p>
          )}

          <p className="mt-5 text-[0.8rem] text-paper/50">
            Or drag the map to look around.
          </p>
        </div>
      </div>
    </div>
  );
}
