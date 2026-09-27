'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CityMap } from './CityMap';

interface QuickLook {
  readonly address: string | null;
  readonly perUnit: number | null;
  readonly openTotal: number | null;
  readonly units: number | null;
  readonly stabilized: boolean | null;
}

interface HoverState {
  readonly bbl: string;
  readonly x: number;
  readonly y: number;
}

/** Hovering across a block should not fire a request per building. */
const HOVER_DELAY_MS = 260;

/**
 * Holds the map and everything that reacts to pointing at it.
 *
 * The map itself is mounted by the root layout, which is a server component
 * and cannot pass handlers, so this client shell sits between them. It also
 * owns the quick-look cache: a report is expensive, and moving the mouse over
 * a street should not cost one request per building.
 */
export function MapShell() {
  const router = useRouter();
  const [hover, setHover] = useState<HoverState | null>(null);
  const [look, setLook] = useState<QuickLook | null>(null);
  const cacheRef = useRef(new Map<string, QuickLook>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onHover = useCallback((bbl: string | null, x: number, y: number) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);

    if (bbl === null) {
      setHover(null);
      setLook(null);
      return;
    }

    setHover({ bbl, x, y });
    const cached = cacheRef.current.get(bbl);
    setLook(cached ?? null);
    if (cached !== undefined) return;

    timerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/building/${bbl}`);
        if (!response.ok) return;
        const report = (await response.json()) as {
          facts: { value: { address: string; unitsRes: number } | null };
          violations: { value: { open: { total: number } } | null };
          stabilization: { value: { isStabilized: boolean } | null };
          openViolationsPerUnit: number | null;
        };
        const quick: QuickLook = {
          address: report.facts.value?.address ?? null,
          perUnit: report.openViolationsPerUnit,
          openTotal: report.violations.value?.open.total ?? null,
          units: report.facts.value?.unitsRes ?? null,
          stabilized: report.stabilization.value?.isStabilized ?? null,
        };
        cacheRef.current.set(bbl, quick);
        setLook((current) => (current === null ? quick : current));
      } catch {
        // No card is better than a broken one; the building is still clickable.
      }
    }, HOVER_DELAY_MS);
  }, []);

  const onSelect = useCallback(
    (bbl: string) => {
      const address = cacheRef.current.get(bbl)?.address;
      const params = address != null ? `?label=${encodeURIComponent(address)}` : '';
      router.push(`/building/${bbl}${params}`);
    },
    [router],
  );

  return (
    <>
      <CityMap onHover={onHover} onSelect={onSelect} />

      {hover !== null && (
        <div
          className="pointer-events-none fixed z-20 w-60 border border-paper/25 bg-city-deep/95 px-3 py-2 backdrop-blur-sm"
          style={{
            left: Math.min(hover.x + 16, typeof window === 'undefined' ? 0 : window.innerWidth - 260),
            top: Math.max(hover.y - 16, 8),
          }}
          role="tooltip"
        >
          {look === null ? (
            <p className="text-[0.78rem] text-paper/60">Looking up the record…</p>
          ) : (
            <>
              <p className="truncate text-[0.85rem] font-600 text-paper">
                {look.address ?? 'This building'}
              </p>
              {look.perUnit !== null ? (
                <p className="mt-1 text-[0.78rem] text-paper/80">
                  <span className="tabular font-700 text-paper" data-numeric>
                    {look.perUnit.toFixed(2)}
                  </span>{' '}
                  open violations per apartment
                </p>
              ) : (
                <p className="mt-1 text-[0.78rem] text-paper/60">No violation record found.</p>
              )}
              {look.openTotal !== null && look.units !== null && (
                <p className="text-[0.72rem] text-paper/50">
                  {look.openTotal.toLocaleString()} open · {look.units} units
                </p>
              )}
              {look.stabilized === true && (
                <p className="mt-1 text-[0.72rem] text-clear">Rent stabilized</p>
              )}
              <p className="mt-1.5 text-[0.72rem] text-paper/40">Click to open the record</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
