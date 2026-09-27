'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapMode, subscribeToMap, type MapMode } from '@/lib/map/store';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

/** NYC publishes roof heights in feet; Mapbox extrudes in metres. */
const FT_TO_M = 0.3048;

/**
 * Midtown, close enough in that the 3D building data is actually there.
 * Mapbox only carries extrusion geometry from roughly zoom 15, so a wider
 * opening shot shows a flat street grid and reads as broken.
 */
const HOME = {
  center: [-73.9812, 40.7527] as [number, number],
  zoom: 15.6,
  pitch: 60,
  bearing: -20,
};

/** The product is about New York, so the camera stays in New York. */
const NYC_BOUNDS: [[number, number], [number, number]] = [
  [-74.2591, 40.4774],
  [-73.7002, 40.9176],
];

const SUBJECT_SOURCE = 'subject';
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** How the camera frames the building it is about. */
const FOCUS = { zoom: 18.6, pitch: 52, bearing: -28 } as const;

/** Neighbours further out than this cannot block the view at FOCUS.pitch. */
const NEIGHBOUR_RADIUS_M = 90;
/** Anything this close to the centre is the subject itself, not a neighbour. */
const SELF_RADIUS_M = 14;
/** Compass sectors tested for a clear line of sight. 30 degrees each. */
const SECTORS = 12;
/** Below this, swinging the camera costs more in motion than it gains in view. */
const MIN_WORTHWHILE_SWING_DEG = 20;

const METRES_PER_DEG_LAT = 111_320;

/** Block-scale distance. Equirectangular is exact enough over ninety metres. */
function metresBetween(a: readonly [number, number], b: readonly [number, number]): number {
  const midLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const x = (b[0] - a[0]) * Math.cos(midLat) * METRES_PER_DEG_LAT;
  const y = (b[1] - a[1]) * METRES_PER_DEG_LAT;
  return Math.hypot(x, y);
}

/** Compass bearing from a to b, degrees clockwise from north. */
function bearingFrom(a: readonly [number, number], b: readonly [number, number]): number {
  const midLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const x = (b[0] - a[0]) * Math.cos(midLat);
  const y = b[1] - a[1];
  return (Math.atan2(x, y) * (180 / Math.PI) + 360) % 360;
}

function centroidOfGeometry(geometry: GeoJSON.Geometry): readonly [number, number] | null {
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return null;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      sumX += node[0];
      sumY += node[1];
      count += 1;
      return;
    }
    for (const child of node) walk(child);
  };
  walk(geometry.coordinates);
  return count === 0 ? null : [sumX / count, sumY / count];
}

/**
 * The compass bearing that looks at the building from its least obstructed side.
 *
 * A camera at 48 degrees of pitch sits low, so one tall neighbour on the wrong
 * side hides the building the whole report is about. This buckets the
 * surrounding buildings by direction, scores each by height over distance —
 * near-and-tall blocks far more than far-and-tall — and puts the camera in the
 * clearest sector.
 *
 * Returns null when nothing is rendered yet, in which case the caller keeps the
 * bearing it already has rather than swinging somewhere arbitrary.
 */
function clearestBearing(
  map: mapboxgl.Map,
  centre: readonly [number, number],
  subjectHeightM: number,
): number | null {
  if (map.getLayer('city-buildings') === undefined) return null;

  const origin = map.project(centre as [number, number]);
  const reach = 400;
  let features: mapboxgl.MapboxGeoJSONFeature[];
  try {
    features = map.queryRenderedFeatures(
      [
        [origin.x - reach, origin.y - reach],
        [origin.x + reach, origin.y + reach],
      ],
      { layers: ['city-buildings'] },
    );
  } catch {
    return null;
  }
  if (features.length === 0) return null;

  const blocking = new Array<number>(SECTORS).fill(0);
  let sawNeighbour = false;

  for (const feature of features) {
    const neighbour = centroidOfGeometry(feature.geometry);
    if (neighbour === null) continue;

    const distance = metresBetween(centre, neighbour);
    if (distance < SELF_RADIUS_M || distance > NEIGHBOUR_RADIUS_M) continue;

    const rawHeight = feature.properties?.height;
    const height = typeof rawHeight === 'number' ? rawHeight : 0;
    // Only what stands taller than the subject can hide it.
    if (height <= subjectHeightM) continue;

    sawNeighbour = true;
    const sector = Math.floor(bearingFrom(centre, neighbour) / (360 / SECTORS)) % SECTORS;
    const score = (height - subjectHeightM) / Math.max(distance, 1);
    if (score > blocking[sector]) blocking[sector] = score;
  }

  if (!sawNeighbour) return null;

  let clearest = 0;
  for (let sector = 1; sector < SECTORS; sector += 1) {
    if (blocking[sector] < blocking[clearest]) clearest = sector;
  }

  // The camera sits opposite whatever is 'up' on screen, so putting it in the
  // clear sector means pointing the bearing back across the building.
  const cameraDirection = clearest * (360 / SECTORS) + 360 / SECTORS / 2;
  return (cameraDirection + 180) % 360;
}

/** Smallest angle between two bearings, degrees. */
function angleBetween(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

/**
 * Point the camera at whatever the current route has selected.
 *
 * Shared by the subscription and by the map's own load handler: on a direct
 * page load the route publishes its building before the style is ready, so
 * without replaying it on load the camera never moves and the record appears
 * over the wrong part of the city.
 */
function applyMode(map: mapboxgl.Map | null, mode: MapMode): void {
  if (map === null || !map.isStyleLoaded()) return;
  const subject = map.getSource(SUBJECT_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (subject === undefined) return;

  if (mode.kind !== 'focus') {
    subject.setData(EMPTY);
    return;
  }

  subject.setData({
    type: 'Feature',
    properties: { height: (mode.target.heightFt ?? 60) * FT_TO_M },
    geometry: mode.target.geometry as GeoJSON.Geometry,
  });
  const heightM = (mode.target.heightFt ?? 60) * FT_TO_M;

  map.flyTo({
    center: [mode.target.centre[0], mode.target.centre[1]],
    zoom: FOCUS.zoom,
    pitch: FOCUS.pitch,
    bearing: FOCUS.bearing,
    duration: 3200,
    essential: true,
    // The record occupies the lower two thirds of the screen, so lift the
    // building into the clear space above it rather than centring it behind
    // the panel.
    offset: [0, -200],
  });

  // Once the flight has landed and the surrounding tiles are in, swing to
  // whichever side of the building is not behind a taller neighbour. This runs
  // after arrival because the neighbours have to be rendered before they can be
  // measured, and it runs once: easeTo has no listener of its own, so there is
  // no loop.
  map.once('idle', () => {
    const still = getMapMode();
    if (still.kind !== 'focus' || still.target.bbl !== mode.target.bbl) return;

    const better = clearestBearing(map, mode.target.centre, heightM);
    if (better === null) return;
    if (angleBetween(better, map.getBearing()) < MIN_WORTHWHILE_SWING_DEG) return;

    map.easeTo({
      bearing: better,
      duration: 1600,
      essential: true,
      offset: [0, -200],
    });
  });
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The city. One instance for the whole application.
 *
 * Mounted by the root layout and never unmounted, so it survives client-side
 * navigation — the city does not blink between searching and reading a record.
 * Route pages drive it through the command channel in lib/map/store rather
 * than by remounting it.
 */
export function CityMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driftRef = useRef<number | null>(null);
  const userTookOverRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'no-token' | 'no-webgl' | 'failed'>(
    TOKEN === '' ? 'no-token' : 'loading',
  );

  useEffect(() => {
    if (TOKEN === '' || containerRef.current === null || mapRef.current !== null) return;

    const container = containerRef.current;
    let cancelled = false;
    let map: mapboxgl.Map | null = null;

    function stopDrift() {
      if (driftRef.current !== null) {
        cancelAnimationFrame(driftRef.current);
        driftRef.current = null;
      }
    }

    /**
     * Idle drift: a slow bearing rotation so the landing screen is alive
     * without demanding attention. It yields on the first touch and never runs
     * under prefers-reduced-motion.
     */
    function startDrift(map: mapboxgl.Map) {
      if (prefersReducedMotion() || userTookOverRef.current) return;
      stopDrift();
      const step = () => {
        if (userTookOverRef.current) return;
        map.setBearing(map.getBearing() + 0.012);
        driftRef.current = requestAnimationFrame(step);
      };
      driftRef.current = requestAnimationFrame(step);
    }

    function buildLayers(map: mapboxgl.Map) {
      const labelLayer = map
        .getStyle()
        ?.layers?.find((l) => l.type === 'symbol' && 'text-field' in (l.layout ?? {}));

      // The city itself. Lit warmer and more opaque than the base style, and
      // shaded by height, so the skyline reads as buildings rather than a grid
      // of grey blocks.
      map.addLayer(
        {
          id: 'city-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': [
              'interpolate',
              ['linear'],
              ['get', 'height'],
              0,
              '#2b3948',
              60,
              '#3a4c5e',
              200,
              '#53697e',
            ],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.95,
          },
        },
        labelLayer?.id,
      );

      map.addSource(SUBJECT_SOURCE, { type: 'geojson', data: EMPTY });

      map.addLayer({
        id: 'subject-fill',
        source: SUBJECT_SOURCE,
        type: 'fill-extrusion',
        paint: {
          'fill-extrusion-color': '#ff5c1a',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.95,
        },
      });

      // Traced on the ground too, so it stays findable when the camera is low.
      map.addLayer({
        id: 'subject-outline',
        source: SUBJECT_SOURCE,
        type: 'line',
        paint: { 'line-color': '#ff5c1a', 'line-width': 2.5 },
      });

      // Replay whatever the route already selected; on a direct load it was
      // published before the style existed.
      //
      // Deferred to the next idle rather than run here: immediately after
      // addSource/addLayer the style is still mutating and isStyleLoaded()
      // returns false, so applying now silently does nothing.
      map.once('idle', () => {
        const pending = getMapMode();
        if (pending.kind === 'focus') {
          userTookOverRef.current = true;
          stopDrift();
          applyMode(map, pending);
        }
      });

      if (getMapMode().kind !== 'focus') startDrift(map);
    }

    // Deferred so a construction failure reports state asynchronously.
    queueMicrotask(() => {
      if (cancelled) return;

      // Mapbox needs WebGL. Firefox disables it on blocklisted drivers and
      // when hardware acceleration is off, which looks identical to a broken
      // build from the outside — so name the cause rather than fail silently.
      if (!mapboxgl.supported()) {
        setStatus('no-webgl');
        return;
      }

      try {
        mapboxgl.accessToken = TOKEN;
        map = new mapboxgl.Map({
          container,
          style: 'mapbox://styles/mapbox/dark-v11',
          ...HOME,
          maxBounds: NYC_BOUNDS,
          minZoom: 11,
          maxZoom: 20,
          attributionControl: false,
          antialias: true,
        });
      } catch {
        setStatus('failed');
        return;
      }

      mapRef.current = map;
      map.on('error', () => setStatus('failed'));
      map.on('load', () => {
        setStatus('ready');
        try {
          buildLayers(map as mapboxgl.Map);
        } catch (error) {
          // Without this, one bad layer definition aborts the rest of setup and
          // the map looks fine while half its behaviour is missing.
          console.error('[map] layer setup failed', error);
        }
      });

      // The drift is an invitation, not a ride: the first touch hands control
      // over for good.
      const takeOver = () => {
        userTookOverRef.current = true;
        stopDrift();
      };
      for (const event of ['dragstart', 'wheel', 'mousedown', 'touchstart'] as const) {
        map.on(event, takeOver);
      }
    });

    return () => {
      cancelled = true;
      stopDrift();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // React to the building a route page has selected.
  useEffect(() => {
    return subscribeToMap((mode: MapMode) => applyMode(mapRef.current, mode));
  }, []);


  return (
    <div className="fixed inset-0 z-0 bg-city-deep" aria-hidden={status !== 'ready'}>
      {/* h-full, not `absolute inset-0`: mapbox-gl.css sets position:relative
          on .mapboxgl-map once the map initialises, which overrides absolute
          positioning and collapses inset-0 to zero height. */}
      <div ref={containerRef} className="h-full w-full" />

      {status === 'no-token' && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
          <p className="max-w-md text-center text-[0.78rem] leading-snug text-ink-faint">
            Map unavailable — NEXT_PUBLIC_MAPBOX_TOKEN was not present when this build ran. Set it,
            then redeploy without the build cache.
          </p>
        </div>
      )}
      {status === 'no-webgl' && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
          <p className="max-w-md text-center text-[0.8rem] leading-snug text-ink-faint">
            This browser has WebGL turned off, so the 3D map cannot draw. In Firefox, enable
            hardware acceleration in Settings. Everything else on the site works without it.
          </p>
        </div>
      )}
      {status === 'failed' && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
          <p className="text-[0.8rem] text-ink-faint">
            Map failed to load. Everything else still works.
          </p>
        </div>
      )}
    </div>
  );
}
