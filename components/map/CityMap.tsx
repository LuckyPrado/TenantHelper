'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { subscribeToMap, subscribeToStabilized, type MapMode } from '@/lib/map/store';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

/** NYC publishes roof heights in feet; Mapbox extrudes in metres. */
const FT_TO_M = 0.3048;

/** Midtown looking downtown — recognisably New York on first paint. */
const HOME = { center: [-73.9855, 40.7521] as [number, number], zoom: 14.4, pitch: 55, bearing: -20 };

const SUBJECT_SOURCE = 'subject';
const SAMPLE_SOURCE = 'sample';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The city. One instance for the whole application.
 *
 * Mounted by the root layout and never unmounted, so it survives client-side
 * navigation — that continuity between searching, reading a record and going
 * back is the point of the design. Route pages drive it through the command
 * channel in lib/map/store rather than by remounting it.
 */
export interface CityMapProps {
  readonly onHover?: (bbl: string | null, x: number, y: number) => void;
  readonly onSelect?: (bbl: string) => void;
}

export function CityMap({ onHover, onSelect }: CityMapProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driftRef = useRef<number | null>(null);
  // Handlers live in refs so the map is wired once and never rebuilt when the
  // hover card's state changes.
  const onHoverRef = useRef<((bbl: string | null, x: number, y: number) => void) | null>(null);
  const onSelectRef = useRef<((bbl: string) => void) | null>(null);
  const userTookOverRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'no-token' | 'no-webgl' | 'failed'>(
    TOKEN === '' ? 'no-token' : 'loading',
  );

  useEffect(() => {
    if (TOKEN === '' || containerRef.current === null || mapRef.current !== null) return;

    const container = containerRef.current;
    let cancelled = false;
    let map: mapboxgl.Map | null = null;

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
          attributionControl: false,
          antialias: true,
        });
      } catch {
        setStatus('failed');
        return;
      }

      mapRef.current = map;
      map.on('error', () => setStatus('failed'));
      map.on('load', () => onLoad(map as mapboxgl.Map));

      // The drift is an invitation, not a ride: the first touch hands control
      // over for good. Previously this was declared but never attached, so the
      // camera kept rotating under the user.
      const takeOver = () => {
        userTookOverRef.current = true;
        stopDrift();
      };
      for (const event of ['dragstart', 'wheel', 'mousedown', 'touchstart'] as const) {
        map.on(event, takeOver);
      }
    });

    let loadTimer: ReturnType<typeof setTimeout> | null = null;
    let lastKey = '';

    /** Debounced: panning should not fire a request per frame. */
    function loadViewport(map: mapboxgl.Map) {
      if (loadTimer !== null) clearTimeout(loadTimer);
      loadTimer = setTimeout(() => void loadViewportNow(map), 350);
    }

    /** Fetch the buildings in view, skipping a viewport we already loaded. */
    async function loadViewportNow(map: mapboxgl.Map) {
      {
        if (map.getZoom() < 14) {
          (map.getSource(SAMPLE_SOURCE) as mapboxgl.GeoJSONSource | undefined)?.setData(EMPTY);
          return;
        }
        const b = map.getBounds();
        if (b === null) return;
        const key = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
          .map((n) => n.toFixed(3))
          .join(',');
        if (key === lastKey) return;
        lastKey = key;

        try {
          const response = await fetch(
            `/api/map/buildings?w=${b.getWest()}&s=${b.getSouth()}&e=${b.getEast()}&n=${b.getNorth()}`,
          );
          if (!response.ok) return;
          const data = (await response.json()) as GeoJSON.FeatureCollection;
          const source = map.getSource(SAMPLE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
          source?.setData(data);
        } catch {
          // A failed viewport fetch just means no highlights; the map is fine.
        }
      }
    }

    function stopDrift() {
      if (driftRef.current !== null) {
        cancelAnimationFrame(driftRef.current);
        driftRef.current = null;
      }
    }

    /**
     * Idle drift. A slow bearing rotation so the landing screen is alive
     * without demanding attention; it yields the moment the user touches the
     * map or a building is selected, and never runs under reduced motion.
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

    function onLoad(map: mapboxgl.Map) {
      setStatus('ready');
      try {
        buildLayers(map);
      } catch (error) {
        // Without this, one bad layer definition aborts the rest of setup and
        // the map looks fine while half its behaviour is missing.
        console.error('[map] layer setup failed', error);
      }
    }

    function buildLayers(map: mapboxgl.Map) {

      const labelLayer = map
        .getStyle()
        ?.layers?.find((l) => l.type === 'symbol' && 'text-field' in (l.layout ?? {}));

      // The city itself, extruded and muted so highlights read against it.
      map.addLayer(
        {
          id: 'city-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 13,
          paint: {
            'fill-extrusion-color': '#1b2430',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.9,
          },
        },
        labelLayer?.id,
      );

      map.addSource(SAMPLE_SOURCE, { type: 'geojson', data: EMPTY });
      map.addSource(SUBJECT_SOURCE, { type: 'geojson', data: EMPTY });

      // Nearby buildings we can report on. Neutral on purpose — colouring these
      // by severity would turn browsing into an accusation.
      map.addLayer({
        id: 'sample-fill',
        source: SAMPLE_SOURCE,
        type: 'fill-extrusion',
        paint: {
          // A plain colour at creation. A feature-state expression here throws
          // on a source with no feature ids, which aborted the rest of onLoad
          // and silently cost us the hover handlers and the viewport loader.
          // The stabilized toggle recolours this with setPaintProperty instead.
          'fill-extrusion-color': '#8fb3c7',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.6,
        },
      });

      // Hovering a building is how you find out it is worth opening.
      map.on('mousemove', 'sample-fill', (event) => {
        map.getCanvas().style.cursor = 'pointer';
        const feature = event.features?.[0];
        const bbl = feature?.properties?.bbl;
        if (typeof bbl === 'string') onHoverRef.current?.(bbl, event.point.x, event.point.y);
      });
      map.on('mouseleave', 'sample-fill', () => {
        map.getCanvas().style.cursor = '';
        onHoverRef.current?.(null, 0, 0);
      });
      map.on('click', 'sample-fill', (event) => {
        const bbl = event.features?.[0]?.properties?.bbl;
        if (typeof bbl === 'string') onSelectRef.current?.(bbl);
      });

      // Load what is in view, and again whenever the user stops moving.
      // Only user-driven movement triggers a reload. The idle drift also emits
      // moveend, and letting it through reset the debounce on every frame so
      // the fetch never fired at all.
      map.on('moveend', () => {
        if (userTookOverRef.current) loadViewport(map);
      });
      loadViewportNow(map);

      // The building being reported on.
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

      startDrift(map);
    }

    return () => {
      cancelled = true;
      stopDrift();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Kept in an effect, not assigned during render: mutating a ref while
  // rendering is unsafe under concurrent rendering, and these only need to be
  // current by the time a pointer event fires.
  useEffect(() => {
    onHoverRef.current = onHover ?? null;
    onSelectRef.current = onSelect ?? null;
  }, [onHover, onSelect]);

  // React to mode changes published by route pages.
  useEffect(() => {
    return subscribeToMap((mode: MapMode) => {
      const map = mapRef.current;
      if (map === null || !map.isStyleLoaded()) return;

      const subject = map.getSource(SUBJECT_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      if (subject === undefined) return;

      if (mode.kind === 'focus') {
        userTookOverRef.current = true;
        subject.setData({
          type: 'Feature',
          properties: { height: (mode.target.heightFt ?? 60) * FT_TO_M },
          geometry: mode.target.geometry as GeoJSON.Geometry,
        });
        map.flyTo({
          center: [mode.target.centre[0], mode.target.centre[1]],
          zoom: 16.8,
          pitch: 62,
          bearing: -28,
          duration: 3200,
          essential: true,
        });
      } else {
        subject.setData(EMPTY);
      }
    });
  }, []);

  // The stabilized overlay is orthogonal to mode, so it has its own channel.
  useEffect(() => {
    return subscribeToStabilized((on) => {
      const map = mapRef.current;
      if (map?.getLayer('sample-fill') === undefined) return;
      // Recolour only the buildings the data says are stabilized, rather than
      // tinting the whole layer.
      map.setPaintProperty('sample-fill', 'fill-extrusion-color', [
        'case',
        ['all', on, ['get', 'stabilized']],
        '#4ade80',
        on ? '#2b3a46' : '#8fb3c7',
      ]);
    });
  }, []);

  return (
    <div className="fixed inset-0 z-0 bg-city-deep" aria-hidden={status !== 'ready'}>
      {/* h-full, not `absolute inset-0`: mapbox-gl.css sets position:relative
          on .mapboxgl-map once the map initialises, which overrides absolute
          positioning and collapses inset-0 to zero height. The canvas then
          falls back to 300px and the city is invisible. */}
      <div ref={containerRef} className="h-full w-full" />
      {status === 'no-token' && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
          <p className="max-w-md text-center text-[0.78rem] leading-snug text-paper-edge/70">
            Map unavailable — NEXT_PUBLIC_MAPBOX_TOKEN was not present when this build ran. Set it,
            then redeploy without the build cache.
          </p>
        </div>
      )}
      {status === 'no-webgl' && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
          <p className="max-w-md text-center text-[0.8rem] leading-snug text-paper-edge/80">
            This browser has WebGL turned off, so the 3D map cannot draw. In Firefox, enable
            hardware acceleration in Settings, or set webgl.force-enabled to true in about:config.
            Everything else on the site works without it.
          </p>
        </div>
      )}
      {status === 'failed' && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
          <p className="text-[0.78rem] text-paper-edge/70">
            Map failed to load. Everything else still works.
          </p>
        </div>
      )}
    </div>
  );
}
