# Plan: NYC Tenant Building Intelligence

**Source**: free-form requirements (`/plan`), revised 2026-09-26 after scope triage
**Complexity**: Medium — **~28h of build in a 36h window**
**Event**: DivHacks (NYC)
**Centerpiece**: address → building report card. Everything else is supporting cast.
**Sponsor tracks**: Gemini · .Tech · ElevenLabs · Tiger Data

---

## Summary

Enter a NYC address, get a sourced picture of the building's condition, its landlord's other
buildings, what the area rents for, and whether the unit is rent stabilized — so a prospective
tenant can decide whether to sign.

The product is not the UI. It is the **join across public datasets on BBL**, and the
**per-unit normalization** that turns a raw violation count into something actionable.

---

## ⚠️ READ THIS FIRST — Verified Data Layer

Every endpoint below was executed live on 2026-09-26 and returned real data. **Do not re-derive this
and do not trust a model's memory of these schemas — several are counter-intuitive and one fails
silently.** Re-run the Validation commands to confirm nothing moved.

### The join key

`https://geosearch.planninglabs.nyc/v2/search?text=<address>&size=1`

- **No API key.** Key lives at `features[0].properties.addendum.pad.bbl` (and `.bin`).
- Verified: `500 West 175 Street Manhattan` → `bbl=1021310044`, `bin=1063170`
- Decomposes to `boroid=1`, `block=2131`, `lot=44` (strip leading zeros — gotcha 1)

### Conditions + ownership — verified

| Signal | Dataset | Key field |
|---|---|---|
| HPD violations | `wvxf-dwi5` | `boroid`+`block`+`lot` ⚠️ **no bbl column** |
| Housing litigations | `59kj-x8nc` | `bbl` ✅ |
| Evictions | `6z8x-wfk4` | `bbl` ✅ |
| Bedbug filings | `wz6d-d3jb` | `bbl` ✅ |
| DOB violations | `3h2n-5cm9` | `bin` ✅ |
| Units / year / floors | `64uk-42ks` (PLUTO) | `bbl` ⚠️ **float string** |
| HPD registration | `tesw-yqqr` | `boroid`+`block`+`lot` → `registrationid` |
| Landlord + agent | `feu5-w2e2` | `registrationid` |

### Rent + stabilization — verified, both keyless

**Zillow ZORI** (area rent + trend):
`https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv`
10 MB, HTTP 200, no key. 149 columns = monthly series to **2026-08-31**, keyed by ZIP (`RegionName`).
Unpivot wide→long for charting.
Verified Aug 2026: `10033` **$3,204/mo** · `10027` **$3,918** · `11211` **$5,020**

**Rent stabilization** (`firstmovernyc/nyc-rent-stabilized-listings`):
`https://media.githubusercontent.com/media/firstmovernyc/nyc-rent-stabilized-listings/main/5_coordinates_complete/listing_with_coordinates_complete.csv`
- ⚠️ **Git LFS** — `raw.githubusercontent.com` returns a *pointer file*. Use the `media.` host. 5.2 MB.
- Columns: `BOROUGH, ZIP, BUILDING_NO, CLEAN_BUILDING_NO, STREET, BLOCK, LOT, COUNTY, CITY, STATUS1..3, LATITUDE, LONGITUDE`
- **`BOROUGH`+`BLOCK`+`LOT` → BBL.** Borough name → boroid (Manhattan 1, Bronx 2, Brooklyn 3,
  Queens 4, Staten Island 5); zero-pad block to 5, lot to 4.
- 49,119 buildings: Brooklyn 16,597 · Manhattan 14,427 · Queens 10,010 · Bronx 7,659 · SI 426
- `STATUS1`: `MULTIPLE DWELLING A` 36,668 · empty 10,010 (**all Queens**) · `MULTIPLE DWELLING B` 2,441
- Upstream is the Rent Guidelines Board (legitimate). The repo is a **hobby project, no license
  specified**, self-describes as possibly erroneous. → **Do not vendor the CSV.** Fetch at build
  time, credit repo + RGB visibly, label "community-sourced, unofficial," never state as legal fact.

### Two demo buildings

| | 609 W 180 St | 500 W 175 St |
|---|---|---|
| BBL | `1021620074` | `1021310044` |
| Open HPD violations | **430** | 99 (58 B, 27 C, 14 A) |
| Residential units | 20 | 58 |
| **Open per unit** | **21.5** 🔥 | 1.71 |
| Rent stabilized | No | **Yes** (`MULTIPLE DWELLING A`) |
| Other | — | 15 litigations · 3 evictions · 8 bedbug · 19 DOB · built 1911 · `registrationid` 106491 · MAURAY REALTY USA LLC, agent LANGSAM PROP. SERV. CORP. |

Lead with 609 (shock value), then 500 (stabilized → RGB cap makes the projection a *rule*).

### FOUR GOTCHAS THAT WILL COST HOURS

**1. HPD violations (`wvxf-dwi5`) has NO `bbl` column — and filtering on it FAILS SILENTLY.**
`?bbl=1021310044` returns `[{"count_1":"0"}]`, not an error. You would ship an app reporting **every
building as spotless.** Correct form, unpadded strings:
```bash
curl "https://data.cityofnewyork.us/resource/wvxf-dwi5.json?\$select=violationstatus,class,count(1)%20as%20n&\$where=boroid='1'%20AND%20block='2131'%20AND%20lot='44'&\$group=violationstatus,class"
# → Close/B 295, Close/C 139, Close/A 70, Open/B 58, Open/C 27, Open/A 14
```

**2. PLUTO returns `bbl` as a float string**: `"1021310044.00000000"`. Bulk `IN (...)` accepts quoted
or numeric input but still *returns* the float form. Everything through `normalizeBbl`.

**3. HPD Complaints (`uwyv-629c`) is auth-gated** — *"You must be logged in."* Don't design around it.

**4. Register a free Socrata app token** and send `X-App-Token`. Unauthenticated calls throttle.

### Portfolio: use the agent join, not the owner join

NYC landlords register **one LLC per building** by design:

| Approach | Buildings |
|---|---|
| PLUTO `ownername='MAURAY REALTY USA LLC'` | **1** ❌ |
| HPD contacts `corporationname='LANGSAM PROP. SERV. CORP.'` | **13** ✅ |
| HPD contacts `firstname='FRED' AND lastname='STAHL'` | **5** ✅ |

### Leaderboard aggregate — verified
```bash
curl "https://data.cityofnewyork.us/resource/wvxf-dwi5.json?\$select=block,lot,count(1)%20as%20n&\$where=zip='10033'%20AND%20violationstatus='Open'&\$group=block,lot&\$order=n%20desc&\$limit=6"
# → 2164/7501: 591 · 2162/74: 430 · 2165/45: 380 · 2149/93: 365 ...
```
Filter lots ≥ 7500 (condo billing lots). Join PLUTO for the units denominator.

### Not available — settled, do not revisit
**Market rent is not in NYC Open Data** (27 catalog hits for "rent", all affordable-housing/NYCHA
finance). HUD FMR needs a token (401). Sales history `usep-8jbt` is *rolling 12 months* and returned
`[]` for our building. No landlord rating data exists anywhere.

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| — | **none** | The repo was empty at authoring. No conventions to inherit — established below as a deliberate choice. Do not invent a pattern and claim it was inherited. |

Established conventions:
- One module per source in `lib/nyc/`, each taking a normalized `Bbl`
- **Every fetcher returns `{ ok: true, data } | { ok: false, reason }`. A failed source must never
  render as zero** — same silent-failure class as gotcha 1
- Vitest, colocated `*.test.ts`. Test `lib/nyc/bbl.ts` and the fetchers
- Server handlers log dataset id + key + ms per upstream call

---

## Locked product decisions

**Rating:** a **building** grade only — the landlord grade is shelved. Transparent letter grade with
inputs, thresholds and weights **printed on screen beside it**, each linking to its dataset. A
rule-based grade a judge can audit in ten seconds is defensible; an opaque weighted composite is not.

**Landlord:** portfolio as **facts only** — "also runs N buildings, X combined open violations." No
judgment.

**Predictions:**
- ✅ Stabilized → RGB published allowable increase. A *rule*, not a forecast.
- ✅ Unstabilized → ZORI trend, with method and "based on N months of Zillow observed rent index for
  ZIP X" printed next to the number.
- ✅ Violation trajectory from `inspectiondate` → improving / worsening.
- ❌ **No ML model.** No ground truth, no training set. A fabricated model loses the judging conversation.

**Per-building asking rent (RapidAPI):** layered, never load-bearing. ZORI is the keyless baseline.
Free-tier limits are **unverified** (docs need a login); unofficial scrapers break without notice and
sit against Zillow's ToS. Cache hard, fixture demo buildings, first in the drop order.

---

## Files to Change

Reuse `lib/nyc/bbl.ts` (written, 6 tests passing) wherever a BBL crosses a boundary.

| File | Action | Why |
|---|---|---|
| `lib/nyc/hpdViolations.ts` | CREATE | boro/block/lot query grouped by class + status |
| `lib/nyc/{litigations,evictions,bedbugs,dobViolations,pluto}.ts` | CREATE | One per verified source |
| `lib/nyc/zori.ts` | CREATE | Fetch + unpivot; ZIP → series + trend |
| `lib/nyc/stabilized.ts` | CREATE | LFS-media fetch, borough→boroid, BLOCK/LOT→BBL, Set lookup |
| `lib/nyc/rgb.ts` | CREATE | Static table of RGB allowable increases by year |
| `lib/nyc/landlord.ts` | CREATE | `tesw-yqqr` → `feu5-w2e2` agent join |
| `lib/nyc/leaderboard.ts` | CREATE | Grouped aggregate; filter lots ≥7500; PLUTO units join |
| `lib/grade.ts` | CREATE | Rule-based grade; **thresholds exported as data so the UI can print them** |
| `lib/rights.ts` | CREATE | Violation class/type → applicable right + filing path |
| `lib/gemini.ts` | CREATE | Server-only. Grounded summary + Q&A |
| `lib/tiger/*.ts` | CREATE | Connection + ingests + aggregate — isolated so it stays cuttable |
| `lib/rent/listings.ts` | CREATE (LATER) | RapidAPI behind cache + fixture fallback |
| `app/api/building/[bbl]/route.ts` | CREATE | Server proxy — hides token, fans out, sets `revalidate` |
| `app/page.tsx` | UPDATE | Address search + matched-address confirmation |
| `app/building/[bbl]/page.tsx` | CREATE | **Centerpiece** |
| `app/leaderboard/page.tsx` | CREATE | Best / worst |
| `fixtures/demo-*.json` | CREATE | Offline fallback for every demo path |

---

## Tasks — MUST (~28h of 36h)

### Phase 0 — Scaffold + deploy ✅ MOSTLY DONE (2026-09-26)
Done: Next **16.3.6** / React 19.2.8, TS, Tailwind, App Router; git repo on `main`; Vitest;
`lib/nyc/bbl.ts` + 6 passing tests; all three gates green.
**Remaining (human): connect Vercel, confirm a public URL.** Do before Phase 2.
Note: `@types/node` bumped 20 → ^24 for Vitest 5 peers (local Node v24.12.0 — correct resolution,
not a `--legacy-peer-deps` workaround).

⚠️ **This is Next 16, not 15.** Its generated `AGENTS.md` warns APIs and conventions differ from
training data. Read `node_modules/next/dist/docs/` before writing Next-specific code.

| # | Phase | Est | Notes |
|---|---|---|---|
| 1 | Conditions fetchers | 3.5h | `tdd-workflow` skill here; assert the verified counts |
| 2 | **Building report card** | 4h | Centerpiece. Confirm matched address. Every number links to its dataset |
| 3 | Area rent + trend (ZORI) | 2.5h | Label "area rent" — never imply it is this unit's rent |
| 4 | Stabilization status + RGB cap | 1.5h | The piece that makes the projection a rule |
| 5 | Landlord portfolio, facts only | 3h | Agent join |
| 6 | Building grade + flags | 1.5h | Thresholds printed |
| 7 | Best/worst leaderboard, 1–2 ZIPs | 2h | Filter lots ≥7500 |
| 8 | Tenant rights → actual violations | 1.5h | Rule-based mapping, not free-generated |
| 9 | **Gemini** | 2h | Grounded summary + rights Q&A |
| 10 | **.Tech** | 0.2h | Register, point at Vercel. Do while something else builds |
| 11 | **ElevenLabs** | 1h | Narrate Gemini's text. Depends on #9 |
| 12 | **Tiger Data** | 3.5h | Read-side only — see below |
| 13 | Polish, mobile, fixtures, rehearsal | 2h | Judges use phones |

### Tiger Data without endangering the demo
Core path stays live against Socrata. Tiger Data gets the three time-series/bulk jobs:
1. **ZORI hypertable** — `(zip, month, rent)`. Textbook hypertable, coherent story.
2. **Stabilized table** — 49k rows indexed by BBL for O(1) lookup.
3. **Leaderboard continuous aggregate** — instant best/worst.

If it's down at 3am: centerpiece unaffected, stabilization falls back to an in-memory Set from the
CSV, leaderboard falls back to static JSON. That split is the entire point.

### LATER
RapidAPI per-building asking rent (~1.5h) · projection confidence band · compare 2–3 buildings ·
violation trajectory sparkline · map view.

### DROP — decided, do not revisit mid-hackathon
Landlord rating · sales/ownership history · HUD FMR · rent stabilization via taxbills.nyc · any ML
prediction · Solana · MongoDB · Backboard · DigitalOcean · StreetEasy scraping · composite 0–100 score.

### ⚠️ Pre-committed drop order
Behind at **hour 24**? Cut in this order, no deliberation:
1. **RapidAPI layer** 2. **Tiger Data** 3. **ElevenLabs** 4. **Leaderboard** 5. **Tenant rights** → static links

**Never cut:** report card · area rent trend · stabilization status · landlord portfolio · grade.
Those five *are* the product.

---

## Validation

```bash
npm test && npm run typecheck && npm run build     # all green at commit e3d1a6f

# join key
curl -s "https://geosearch.planninglabs.nyc/v2/search?text=500%20West%20175%20Street%20Manhattan&size=1" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).features[0].properties.addendum.pad))'
# expect {"bbl":"1021310044","bin":"1063170","version":"26c"}

# conditions
curl -s "https://data.cityofnewyork.us/resource/wvxf-dwi5.json?\$select=violationstatus,class,count(1)%20as%20n&\$where=boroid='1'%20AND%20block='2131'%20AND%20lot='44'&\$group=violationstatus,class"
# expect Open: B 58, C 27, A 14

# ZORI reachable
curl -sI "https://files.zillowstatic.com/research/public_csvs/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv" | head -1

# stabilized CSV — MUST be the media host, not raw
curl -sL -o /dev/null -w "%{http_code} %{size_download}\n" \
 "https://media.githubusercontent.com/media/firstmovernyc/nyc-rent-stabilized-listings/main/5_coordinates_complete/listing_with_coordinates_complete.csv"
# expect 200 5231164
```

**Demo rehearsal** — on a phone, wifi off, against fixtures:
**609 W 180 St** (21.5/unit, not stabilized) → **500 W 175 St** (1.71/unit, **stabilized**, RGB cap)
→ a clean building → leaderboard → one Gemini rights question → ElevenLabs narration.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Silent zeros from the `bbl` trap | **High** | Fetchers return explicit failure, never 0. Assert real counts in tests |
| Four sponsor tracks dilute the build | **High** | Each non-blocking and cuttable; drop order pre-committed |
| Tiger Data reverses the no-DB decision | **High** | Read-side analytics only; core path never depends on it |
| Gemini invents tenant-rights law | **High** | Ground strictly in retrieved facts + curated text; never free-generate legal advice; cite sources |
| Socrata throttling mid-demo | High | App token hour 0 + fixtures |
| Address→BBL misses / ambiguity | High | Confirm matched address in UI; check GeoSearch `match_type` (the reference lookup returned `fallback`, not `exact`); curate demo addresses |
| Stabilized CSV unlicensed, may contain errors | Medium | Don't vendor; credit repo + RGB; label unofficial; never state as legal fact |
| RapidAPI limits unknown | Medium | Layered, cached, fixtured, first to drop |
| ZORI is ZIP-level | Medium | Label "area rent" everywhere |
| Prior art: JustFix *Who Owns What* | Medium | Cite it. Differentiate on tenant-facing report + rent + stabilization + grade |
| Queens rows lack `STATUS1` | Low | Presence-in-list is the signal; don't rely on status text for Queens |
| Condo billing lots (≥7500) | Low | Filter them |

---

## Acceptance

- [ ] Deployed to a public URL before Phase 2
- [ ] `lib/nyc/bbl.ts` tested for padding + PLUTO float forms ✅
- [ ] 609 W 180 St reports 430 open / 20 units / 21.5 per unit
- [ ] 500 W 175 St reports 99 open / 58 units / 1.71 per unit **and flags as rent stabilized**
- [ ] Every displayed number links to its source dataset
- [ ] Portfolio uses the **agent** join (13), not `ownername` (1)
- [ ] No source failure can render as a zero
- [ ] Grade shows its thresholds; no black-box score
- [ ] Stabilization credited to the repo + RGB and labelled unofficial
- [ ] All four sponsor tracks integrated, each independently removable
- [ ] Works on a phone, offline, against fixtures

---

## ECC Usage Notes

**Entry point**: `/prp-implement .claude/plans/nyc-tenant-building-intelligence.plan.md`
Takes a plan path, detects the package manager, executes with a validation loop after every change.
Self-contained.

> **`/orch-build-mvp` is broken in this install.** The `minimal` profile ships all 94 commands but
> only 48 skills, and it wraps a missing `orch-build-mvp` skill (also chains to a missing `gan-build`).
> Verified broken: all five `/orch-*`, plus `/evolve` and `/jira`. **The other 87 commands are fine.**

| When | ECC surface |
|---|---|
| `lib/nyc/bbl.ts`, fetchers | `tdd-workflow` skill |
| **After the data layer** | `silent-failure-hunter` agent — high value given gotcha 1 |
| Build breaks | `/react-build` or `react-build-resolver` |
| Before demo | `/code-review` → `typescript-reviewer` + `react-reviewer` |
| Between phases | `/checkpoint` |
| Context fills up | `context-budget` |

**Skip the rest** — ~6 of 48 skills survive a hackathon clock.

**On model choice:** this plan was authored by **Opus 5, already the top tier** — there is no larger
model to escalate to. A fresh session buys a clean context window and more thinking budget, not more
capability. ECC's `minimal` profile adds ~13.3k tokens to every session floor (~27.3k → ~40.6k);
budget accordingly on a Pro plan.
