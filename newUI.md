# Architectural Specification & UI/Backend Contract: NYC 3D Digital Twin

## 1. Executive Summary & Division of Concerns

This project is a high-performance **3D Digital Twin Property Intelligence Platform for New York City**.

- **Frontend / Client (Already Specified):** 
  - WebGL/WebGPU-based 3D viewport with dynamic camera control (`pitch: 65°`, `bearing: -25°`, smooth bezier fly-to).
  - Ambient dark-mode HUD (glassmorphism, low visual noise, vignette, horizon fog).
  - Real-time address autocomplete & search orchestration.
  - Dynamic 3D feature isolation: target building illuminates in cyan (`#00e5ff`) while the surrounding city grid dims.
  - Slide-out Property Intelligence Panel (dossier layout).

- **Claude's Objective (Backend, Data Pipeline & Architecture):**
  - Implement the geocoding pipeline returning coordinates, Borough-Block-Lot (**BBL**), and Building Identification Number (**BIN**).
  - Aggregate property data from NYC Open Data (MapPLUTO, DOB NOW, Housing Preservation & Development).
  - Expose clean REST/RPC endpoints matching the frontend JSON contract below.

---

## 2. Spatial Engine Architecture & 3D Model Decision

The prompt requests **"actual geometry, rooftops, architectural details — the digital twin appearance."**

### Current Client Baseline: Mapbox GL JS v3 (Vector Extrusions)
- **Status:** Implemented in the initial UI prototype.
- **Pros:** 60fps on mobile/desktop, instant loading, programmatic feature picking via `queryRenderedFeatures`, and zero asset cost.
- **Limitation:** Buildings are 2.5D prism extrusions with flat rooftops (no ornamental crowns, spires, or setback details unless custom glTF models are injected).

### Target Production Engine: CesiumJS + Google Photorealistic 3D Tiles
If the goal is true digital twin mesh fidelity (e.g., Chrysler Building gargoyles, Empire State mast, rooftop HVAC units):
- **Recommendation:** Keep the UI layer (search bar, dossier panel, CSS tokens) identical, but swap the internal viewport from Mapbox to **CesiumJS** or **Deck.gl** consuming Google Photorealistic 3D Tiles.
- **Highlight Technique in Mesh 3D Tiles:**
  Unlike vector extrusions with clean polygon IDs, photorealistic tiles are textured 3D meshes. Highlighting is handled via:
  1. **3D Tile Styling:** Applying a dynamic `Cesium3DTileStyle` conditional color filter matching the building footprint polygon from NYC MapPLUTO.
  2. **Coordinate Bounding Cylinder / Highlight Box:** Dropping an accented 3D bounding geometry over the mesh.

> **Planning Directive for Claude:** Design the backend to return the building's **GeoJSON footprint polygon** along with coordinates. This ensures the frontend can isolate/highlight the building regardless of whether the rendering engine is Mapbox GL JS or CesiumJS.

---

## 3. End-to-End User Interaction Flow

[User Types Address]
│
▼
[GET /api/geocode/autocomplete?q=...]
│
▼
[User Selects Address Suggestion]
│
├───► [Client] map.flyTo({ center: [lng, lat], pitch: 65, zoom: 17.5 })
│
├───► [Client] Isolates building mesh/extrusion & sets surrounding opacity to 0.3
│
└───► [GET /api/properties/:bbl]
│
▼
[Client] Opens Property Intelligence Panel with Dossier Data
code Code

---

## 4. API Specification & Data Contracts

Claude should design the backend services around these two primary endpoints:

### Endpoint 1: Geocoding & Address Resolution
Instead of a generic worldwide geocoder, use **NYC Planning Labs GeoSearch** or the **NYC Geoclient API**. These return NYC-native keys (**BBL** and **BIN**), which are mandatory for downstream property lookups.

- **Route:** `GET /api/v1/geocode/autocomplete?q={search_string}`
- **Response Schema:**
```json
{
  "suggestions": [
    {
      "id": "bbl-1008350041",
      "name": "Empire State Building",
      "address": "350 5th Ave, New York, NY 10118",
      "borough": "Manhattan",
      "bbl": "1008350041",
      "bin": "1015257",
      "coordinates": {
        "lng": -73.985664,
        "lat": 40.748441
      }
    }
  ]
}

Endpoint 2: Property Intelligence Dossier

Takes the bbl or bin and queries aggregated NYC Open Data sources.

    Route: GET /api/v1/properties/:bbl

    Response Schema:

code JSON

{
  "identifiers": {
    "bbl": "1-00835-0041",
    "bin": "1015257",
    "borough": "Manhattan",
    "block": "00835",
    "lot": "0041"
  },
  "address": {
    "street": "350 5th Avenue",
    "city": "New York",
    "state": "NY",
    "zipcode": "10118",
    "neighborhood": "Midtown Manhattan"
  },
  "physical": {
    "height_ft": 1454,
    "stories": 102,
    "year_built": 1931,
    "gross_floor_area_sqft": 2768591,
    "residential_units": 3,
    "commercial_units": 89,
    "building_class": "O4",
    "building_class_desc": "Office High-Rise"
  },
  "zoning": {
    "primary_zone": "C5-3",
    "commercial_overlay": null,
    "special_district": "MID",
    "far": 15.0
  },
  "compliance": {
    "open_dob_violations": 2,
    "open_hpd_violations": 0,
    "local_law_97_grade": "A",
    "last_major_alteration": 2019
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [-73.9864, 40.7481],
        [-73.9848, 40.7488],
        [-73.9851, 40.7491],
        [-73.9867, 40.7484],
        [-73.9864, 40.7481]
      ]
    ]
  }
}

5. NYC Open Data Sources to Ingest

To populate the schema above, Claude should integrate with the following Socrata / NYC Open Data APIs:

    MapPLUTO (NYC Dept. of City Planning)

        Dataset: Primary tax lot and building characteristic database.

        Key Fields: BBL, BldgClass, YearBuilt, NumFloors, BldgArea, ResArea, UnitsRes, ZoneDist1, SplitZone.

        Socrata ID: 64uk-42ks

    DOB Safety / Violations (DOB NOW & BIS)

        Dataset: Active ECB/DOB building violations.

        Key Fields: BIN, Violation Type, Disposition Date, Severity.

        Socrata ID: 3h2n-5cm9

    NYC Building Footprints (DOITT)

        Dataset: 3D Building geometries with rooftop elevations, base elevations, and ground footprints.

        Key Fields: BIN, HEIGHTROOF, GROUNDELEV, the_geom.

        Socrata ID: 5zhs-2jue

6. Action Items for Claude (Planning Mode Checklist)

    Geocoding Service:

        Define whether to use Planning Labs GeoSearch (https://geosearch.planninglabs.nyc/v2/search) or NYC DoITT Geoclient API.

        Establish caching (Redis / in-memory) for high-frequency autocomplete queries.

    Property Aggregator Service:

        Write a data retrieval module that takes a BBL/BIN and joins data across MapPLUTO and DOB datasets.

        Standardize data transformation into the GET /api/v1/properties/:bbl response contract defined in Section 4.

    Footprint Geometry Provider:

        Ensure the building footprint GeoJSON is returned with the property payload so the frontend can dynamically highlight the exact footprint regardless of camera angle.

    Framework & Stack Selection:

        Recommend backend framework (FastAPI / Node.js Express / Next.js Route Handlers).

        Propose deployment and caching strategy for NYC Open Data rate limits.