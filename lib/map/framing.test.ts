import { describe, expect, it } from 'vitest';
import {
  MAX_FOCUS_ZOOM,
  MIN_FOCUS_ZOOM,
  SECTORS,
  bearingForSector,
  cameraSectorFor,
  chooseCameraBearing,
  HEIGHT_WEIGHT,
  focusOffsetY,
  footprintExtentMetres,
  pixelsForMetres,
  zoomForBuilding,
} from './framing';

const NYC_LAT = 40.75;

/** A square of roughly `metres` on a side, centred near the reference lat. */
function square(metres: number) {
  const dLat = metres / 111_320;
  const dLng = dLat / Math.cos((NYC_LAT * Math.PI) / 180);
  return {
    type: 'Polygon',
    coordinates: [
      [
        [-74, NYC_LAT],
        [-74 + dLng, NYC_LAT],
        [-74 + dLng, NYC_LAT + dLat],
        [-74, NYC_LAT + dLat],
        [-74, NYC_LAT],
      ],
    ],
  };
}

describe('footprintExtentMetres', () => {
  it('measures the diagonal of a footprint', () => {
    // A 40m square has a ~56.6m diagonal.
    expect(footprintExtentMetres(square(40), NYC_LAT)).toBeCloseTo(56.6, 0);
  });

  it('handles MultiPolygon, which is what a large building actually returns', () => {
    // 500 W 18 St came back as a MultiPolygon; a Polygon-only walk would have
    // measured nothing and silently fallen back to the minimum zoom.
    const multi = { type: 'MultiPolygon', coordinates: [square(40).coordinates] };
    expect(footprintExtentMetres(multi, NYC_LAT)).toBeCloseTo(56.6, 0);
  });

  it('returns 0 for geometry it cannot read rather than throwing', () => {
    expect(footprintExtentMetres(null, NYC_LAT)).toBe(0);
    expect(footprintExtentMetres({}, NYC_LAT)).toBe(0);
    expect(footprintExtentMetres({ coordinates: [] }, NYC_LAT)).toBe(0);
  });
});

describe('zoomForBuilding', () => {
  it('pulls back for a tall building and pushes in for a small one', () => {
    const walkUp = zoomForBuilding({ extentM: 20, heightM: 18 }, 900, NYC_LAT);
    const tower = zoomForBuilding({ extentM: 90, heightM: 92 }, 900, NYC_LAT);

    // This is the bug 500 W 18 St exposed: one fixed zoom cannot frame both.
    expect(tower).toBeLessThan(walkUp - 0.5);
  });

  it('actually fits the building in the visible band', () => {
    // The contract that matters. 500 W 18 St is ~90m across and 92m tall; at
    // the old fixed 18.6 it ran off the top of the screen.
    const viewportPx = 900;
    const band = viewportPx * 0.33;

    for (const size of [
      { extentM: 20, heightM: 18 },
      { extentM: 90, heightM: 92 },
      { extentM: 150, heightM: 240 },
    ]) {
      const zoom = zoomForBuilding(size, viewportPx, NYC_LAT);
      const span = Math.max(size.extentM, size.heightM * HEIGHT_WEIGHT);
      expect(pixelsForMetres(span, zoom, NYC_LAT)).toBeLessThanOrEqual(band);
    }
  });

  it('never leaves the usable range, however extreme the building', () => {
    const sizes = [
      { extentM: 0, heightM: 0 },
      { extentM: 5, heightM: 3 },
      { extentM: 400, heightM: 440 },
    ];
    for (const size of sizes) {
      const zoom = zoomForBuilding(size, 800, NYC_LAT);
      expect(zoom).toBeGreaterThanOrEqual(MIN_FOCUS_ZOOM);
      expect(zoom).toBeLessThanOrEqual(MAX_FOCUS_ZOOM);
      expect(Number.isFinite(zoom)).toBe(true);
    }
  });

  it('zooms out on a short viewport, where less fits', () => {
    const phone = zoomForBuilding({ extentM: 90, heightM: 92 }, 640, NYC_LAT);
    const desktop = zoomForBuilding({ extentM: 90, heightM: 92 }, 1000, NYC_LAT);
    expect(phone).toBeLessThan(desktop);
  });
});

describe('cameraSectorFor / bearingForSector', () => {
  it('round-trips a sector through its bearing', () => {
    for (let sector = 0; sector < SECTORS; sector += 1) {
      expect(cameraSectorFor(bearingForSector(sector))).toBe(sector);
    }
  });

  it('normalises bearings given outside -180..180', () => {
    expect(cameraSectorFor(370)).toBe(cameraSectorFor(10));
    expect(cameraSectorFor(-190)).toBe(cameraSectorFor(170));
  });
});

describe('chooseCameraBearing', () => {
  const flat = new Array<number>(SECTORS).fill(0);

  it('stays put when nothing is obstructed', () => {
    // The regression from 500 W 18 St: with all scores equal the old chooser
    // picked sector 0 and swung the camera to an arbitrary side of the
    // building for no gain at all.
    expect(chooseCameraBearing(flat, -28)).toBeNull();
  });

  it('stays put when the default view is already among the clearest', () => {
    const scores = [...flat];
    scores[cameraSectorFor(180)] = 3; // blocked, but not where we are looking
    expect(chooseCameraBearing(scores, -28)).toBeNull();
  });

  it('moves when the default view is the blocked one', () => {
    const scores = [...flat];
    scores[cameraSectorFor(-28)] = 3;
    const chosen = chooseCameraBearing(scores, -28);

    expect(chosen).not.toBeNull();
    expect(scores[cameraSectorFor(chosen as number)]).toBe(0);
  });

  it('prefers the smallest turn among equally clear sectors', () => {
    const scores = new Array<number>(SECTORS).fill(0);
    scores[cameraSectorFor(-28)] = 5;

    const chosen = chooseCameraBearing(scores, -28) as number;
    // Every other sector is clear, so the nearest one wins rather than some
    // sector on the far side of the building.
    const turn = Math.abs(((((chosen - -28) % 360) + 540) % 360) - 180);
    expect(turn).toBeLessThanOrEqual(360 / SECTORS + 1);
  });

  it('ignores a malformed score list instead of guessing', () => {
    expect(chooseCameraBearing([1, 2, 3], -28)).toBeNull();
  });
});

describe('focusOffsetY', () => {
  it('lifts the target above centre, never below', () => {
    for (const height of [640, 844, 900, 1200]) {
      expect(focusOffsetY(height)).toBeLessThan(0);
    }
  });

  it('scales with the viewport instead of being a fixed 200px', () => {
    // A constant offset is a third of a phone screen and a fifth of a desktop.
    expect(Math.abs(focusOffsetY(844))).toBeLessThan(Math.abs(focusOffsetY(1200)));
  });

  it('leaves the ground point above the record panel', () => {
    // The record starts around a third of the way down; the base must sit
    // above it or the building is behind the panel.
    const height = 900;
    const groundY = height / 2 + focusOffsetY(height);
    expect(groundY).toBeLessThan(height * 0.4);
    expect(groundY).toBeGreaterThan(height * 0.2);
  });
});
