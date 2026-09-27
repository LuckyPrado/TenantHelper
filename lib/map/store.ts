/**
 * A tiny command channel between route pages and the one persistent map.
 *
 * The map lives in the root layout so it survives client-side navigation —
 * that continuity is the whole point of the design. But route pages are server
 * components and cannot hold a reference to it, so they publish intent here and
 * the map subscribes.
 *
 * Deliberately not Context: a provider would force the layout subtree to be a
 * client component and drag the server-rendered report down with it.
 */

export interface FocusTarget {
  readonly bbl: string;
  readonly centre: readonly [number, number];
  /** GeoJSON Polygon or MultiPolygon for the building outline. */
  readonly geometry: unknown;
  readonly heightFt: number | null;
}

export type MapMode =
  /** Landing: slow drift over the city, nothing selected. */
  | { readonly kind: 'idle' }
  /** A building is the subject; camera flies in and lights it. */
  | { readonly kind: 'focus'; readonly target: FocusTarget }
  /** User is driving the map; sample buildings are lit and hoverable. */
  | { readonly kind: 'explore' };

type Listener = (mode: MapMode) => void;

let current: MapMode = { kind: 'idle' };
const listeners = new Set<Listener>();

export function getMapMode(): MapMode {
  return current;
}

export function setMapMode(mode: MapMode): void {
  current = mode;
  for (const listener of listeners) listener(mode);
}

export function subscribeToMap(listener: Listener): () => void {
  listeners.add(listener);
  // Replay immediately so a late subscriber is never out of step.
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the stabilized overlay is on. Kept separate: it is orthogonal to mode. */
let stabilizedOn = false;
const stabilizedListeners = new Set<(on: boolean) => void>();

export function isStabilizedLayerOn(): boolean {
  return stabilizedOn;
}

export function toggleStabilizedLayer(on?: boolean): void {
  stabilizedOn = on ?? !stabilizedOn;
  for (const listener of stabilizedListeners) listener(stabilizedOn);
}

export function subscribeToStabilized(listener: (on: boolean) => void): () => void {
  stabilizedListeners.add(listener);
  listener(stabilizedOn);
  return () => {
    stabilizedListeners.delete(listener);
  };
}
