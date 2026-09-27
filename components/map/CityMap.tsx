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
export function CityMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const driftRef = useRef<number | null>(null);
  const userTookOverRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'no-token' | 'failed'>(
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
    });

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
          'fill-extrusion-color': '#8fb3c7',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.55,
        },
      });

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

    const takeOver = () => {
      userTookOverRef.current = true;
      stopDrift();
    };

    return () => {
      cancelled = true;
      stopDrift();
      map?.remove();
      mapRef.current = null;
      void takeOver;
    };
  }, []);

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
      map.setPaintProperty('sample-fill', 'fill-extrusion-color', on ? '#4ade80' : '#8fb3c7');
    });
  }, []);

  return (
    <div className="fixed inset-0 -z-10 bg-city-deep" aria-hidden={status !== 'ready'}>
      <div ref={containerRef} className="absolute inset-0" />
      {status === 'no-token' && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
          <p className="max-w-md text-center text-[0.78rem] leading-snug text-paper-edge/70">
            Map unavailable — NEXT_PUBLIC_MAPBOX_TOKEN was not present when this build ran. Set it,
            then redeploy without the build cache.
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
