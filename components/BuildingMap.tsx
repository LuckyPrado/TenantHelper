'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { FootprintGeometry } from '@/lib/nyc/footprint';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

/** Feet to metres — NYC publishes roof heights in feet, Mapbox extrudes in metres. */
const FT_TO_M = 0.3048;

const SOURCE_ID = 'subject-building';
const FILL_LAYER = 'subject-fill';
const LINE_LAYER = 'subject-outline';

interface BuildingMapProps {
  readonly centre: readonly [number, number];
  readonly geometry: FootprintGeometry;
  readonly heightFt: number | null;
  readonly label: string;
}

/**
 * The building, in its block.
 *
 * The map is decoration over a working report — if the token is missing or the
 * canvas fails, the page renders without it and nothing else changes.
 *
 * The subject building is drawn from its own NYC footprint rather than by
 * picking a feature out of Mapbox's tiles. That is deliberate: tile features
 * carry no BBL, so matching them to our data would mean guessing by proximity,
 * and the outline stays correct at any camera angle either way.
 */
export function BuildingMap({ centre, geometry, heightFt, label }: BuildingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (TOKEN === '' || containerRef.current === null) return;
    // Created once and held in a ref. Re-initialising on every render is the
    // mistake that silently burns map loads.
    if (mapRef.current !== null) return;

    const container = containerRef.current;
    let cancelled = false;
    let map: mapboxgl.Map | null = null;

    // Deferred to a microtask so a construction failure reports state
    // asynchronously; setting state synchronously inside an effect can
    // cascade renders.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        mapboxgl.accessToken = TOKEN;
        map = new mapboxgl.Map({
          container,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [centre[0], centre[1]],
          zoom: 16.2,
          pitch: 58,
          bearing: -22,
          attributionControl: true,
        });
      } catch {
        setFailed(true);
        return;
      }

      mapRef.current = map;
      wire(map);
    });

    function wire(map: mapboxgl.Map) {
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
      map.on('error', () => setFailed(true));

      map.on('load', () => {
      // Surrounding blocks, dimmed so the subject reads against them.
      const labelLayer = map
        .getStyle()
        ?.layers?.find((l) => l.type === 'symbol' && 'text-field' in (l.layout ?? {}));

      map.addLayer(
        {
          id: 'context-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#243041',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.55,
          },
        },
        labelLayer?.id,
      );

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: { height: (heightFt ?? 60) * FT_TO_M },
          geometry: geometry as GeoJSON.Geometry,
        },
      });

      map.addLayer({
        id: FILL_LAYER,
        source: SOURCE_ID,
        type: 'fill-extrusion',
        paint: {
          'fill-extrusion-color': '#ff5c1a',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.92,
        },
      });

      // Traced on the ground too, so the building stays findable when the
      // camera drops low enough that the extrusion is edge-on.
      map.addLayer({
        id: LINE_LAYER,
        source: SOURCE_ID,
        type: 'line',
        paint: { 'line-color': '#ff5c1a', 'line-width': 2.5, 'line-opacity': 0.9 },
      });

        // One orchestrated move on arrival rather than motion scattered about.
        map.easeTo({ zoom: 17.1, pitch: 62, bearing: -28, duration: 2600 });
      });
    }

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [centre, geometry, heightFt]);

  // A missing token is a deployment problem, not a code problem, and silently
  // rendering nothing makes the two indistinguishable. Say which it is.
  if (TOKEN === '') {
    return (
      <div className="flex h-24 items-center justify-center bg-city-deep px-5 text-center">
        <p className="text-[0.8rem] text-paper-edge">
          Map unavailable — NEXT_PUBLIC_MAPBOX_TOKEN was not present when this build ran. Set it,
          then redeploy without the build cache.
        </p>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex h-24 items-center justify-center bg-city-deep px-5 text-center">
        <p className="text-[0.8rem] text-paper-edge">
          Map failed to load. The record below is unaffected.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[42vh] min-h-[260px] w-full overflow-hidden sm:h-[48vh]">
      <div ref={containerRef} className="absolute inset-0" aria-label={`Map of ${label}`} />
      {/* The paper sheet sits directly beneath; this fades the map into it
          rather than leaving a hard seam. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-city-deep" />
    </div>
  );
}
