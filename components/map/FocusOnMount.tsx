'use client';

import { useEffect } from 'react';
import { setMapMode, type FocusTarget } from '@/lib/map/store';

/**
 * Tells the persistent map which building this page is about.
 *
 * The report is a server component and cannot hold a map reference, so it
 * renders this alongside the record: on mount the camera flies in and the
 * building lights, on unmount the selection clears and the city returns to
 * drifting.
 */
export function FocusOnMount({ target }: { readonly target: FocusTarget }) {
  useEffect(() => {
    setMapMode({ kind: 'focus', target });
    return () => setMapMode({ kind: 'idle' });
  }, [target]);

  return null;
}
