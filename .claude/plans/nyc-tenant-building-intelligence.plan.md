# Plan: NYC Tenant Building Intelligence

**Source PRD**: none — authored from free-form requirements (`/plan` conversational mode)
**Selected Milestone**: Phase 0–6 MVP (hackathon deliverable)
**Complexity**: Medium (~20h build inside a 36h window)
**Event**: DivHacks (NYC)
**Authored**: 2026-09-26 by Claude Opus 5, with the data layer verified live (see below)

---

## Summary

A web app where someone considering an apartment enters a NYC address and gets a clear, sourced
picture of the building's condition and its landlord's track record — violations, housing-court
litigation, evictions, bedbug filings — normalized per unit and compared against the neighborhood,
so they can decide whether to sign the lease.

The product is not the UI. The product is the **join across NYC open datasets on BBL**, and the
**per-unit normalization** that turns a raw violation count into a number a tenant can act on.

---

## ⚠️ READ THIS FIRST — Verified Data Layer

Every endpoint below was executed live on 2026-09-26 and returned real data. **Do not re-derive
this and do not trust a model's memory of NYC dataset schemas — several are counter-intuitive and
one fails silently.** Re-run the curl commands to confirm nothing moved before building.

### The join key

`https://geosearch.planninglabs.nyc/v2/search?text=<address>&size=1`

- **No API key. No rate limit problems. Instant.**
- The key lives at `features[0].properties.addendum.pad.bbl` (and `.bin`).
- Verified: `500 West 175 Street Manhattan` → `bbl=1021310044`, `bin=1063170`
- BBL decomposes as `boroid=1`, `block=2131`, `lot=44` (strip leading zeros — see gotcha 1)

### Verified reference building — 500 W 175th St (BBL 1021310044, BIN 1063170)

Use this as the primary demo building. It is genuinely bad, which demos well.

| Signal | Value | Dataset ID | Key field |
|---|---|---|---|
| Open HPD violations | **99** (58 class B, 27 C, 14 A) | `wvxf-dwi5` | `boroid`+`block`+`lot` |
| Closed HPD violations | 504 | `wvxf-dwi5` | same |
| Housing court litigations | 15 | `59kj-x8nc` | `bbl` ✅ |
| Evictions | 3 | `6z8x-wfk4` | `bbl` ✅ |
| Bedbug filings | 8 | `wz6d-d3jb` | `bbl` ✅ |
| DOB violations | 19 | `3h2n-5cm9` | `bin` ✅ |
| Units / built / floors | 58 units, 1911, 6 floors | `64uk-42ks` (PLUTO) | `bbl` (float!) |
| HPD registration | `registrationid=106491` | `tesw-yqqr` | `boroid`+`block`+`lot` |
| Landlord | MAURAY REALTY USA LLC | `feu5-w2e2` | `registrationid` |
| Managing agent | LANGSAM PROP. SERV. CORP. | `feu5-w2e2` | `registrationid` |

**→ 99 open violations / 58 units = 1.71 open violations per unit.** This normalized figure is the
centerpiece metric of the entire product.

### FOUR GOTCHAS THAT WILL COST HOURS IF IGNORED

**1. HPD violations (`wvxf-dwi5`) has NO `bbl` column — and filtering on it FAILS SILENTLY.**

Querying `?bbl=1021310044` returns `[{"count_1":"0"}]` rather than an error. You would ship an app
that reports **every building as spotless**. Confirmed field list contains only
`boroid, boro, housenumber, streetname, block, lot, class, violationstatus, ...` — no `bbl`.

Correct form (verified, unpadded strings):
```bash
curl "https://data.cityofnewyork.us/resource/wvxf-dwi5.json?\$select=violationstatus,class,count(1)%20as%20n&\$where=boroid='1'%20AND%20block='2131'%20AND%20lot='44'&\$group=violationstatus,class"
# → Close/B 295, Close/C 139, Close/A 70, Open/B 58, Open/C 27, Open/A 14
```

**2. PLUTO (`64uk-42ks`) returns `bbl` as a float string:** `"1021310044.00000000"`.
Naive string joins against GeoSearch's `"1021310044"` fail. Normalize both sides.

**3. HPD Complaints (`uwyv-629c`) is auth-gated as of 2026-09-26.** Returns
`{"error": true, "message": "You must be logged in to access this resource"}`. Do not design around
it. Violations + litigations cover the same signal.

**4. Register a free Socrata app token in hour 0** and send it as the `X-App-Token` header.
Unauthenticated requests are throttled, and the demo will hammer these endpoints.

### The portfolio insight (this is the "wow" feature)

NYC landlords deliberately register **one LLC per building**, so the obvious join is worthless:

| Approach | Buildings found |
|---|---|
| PLUTO `ownername='MAURAY REALTY USA LLC'` | **1** ❌ |
| HPD contacts `corporationname='LANGSAM PROP. SERV. CORP.'` (managing agent) | **13** ✅ |
| HPD contacts `firstname='FRED' AND lastname='STAHL'` (head officer) | **5** ✅ |

Both verified. Join `feu5-w2e2` on agent/officer identity → set of `registrationid` → back to
`tesw-yqqr` for their buildings → aggregate violations across the whole portfolio. This is how you
show *"your prospective landlord also runs these 12 other buildings, and here is their combined
record."*

```bash
curl "https://data.cityofnewyork.us/resource/feu5-w2e2.json?\$select=registrationid&\$where=corporationname='LANGSAM%20PROP.%20SERV.%20CORP.'&\$limit=2000"
```

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| — | **none** | `DivHacks/` was empty at authoring time. There is no prior code, so there are **no** conventions to mirror. Establish them in Phase 1 as a deliberate choice and record them in `CLAUDE.md`. Do not invent a pattern and claim it was inherited. |

Conventions to establish in Phase 1:
- One module per data source under `lib/nyc/`, each exporting a typed async fn taking a normalized `Bbl`
- Errors: every fetcher returns `{ ok: true, data } | { ok: false, reason }`. **Never** let a failed
  source render as zero — that is the same silent-failure class as gotcha 1
- Tests: Vitest, colocated `*.test.ts`. Only `lib/nyc/bbl.ts` and the fetchers are worth testing
- Logging: server route handlers log dataset id + key + ms on every upstream call

---

## Files to Change

| File | Action | Why |
|---|---|---|
| `package.json`, `tsconfig.json`, `postcss.config.mjs` | ✅ DONE | **Next.js 16.3.6** + React 19.2.8 + TS + Tailwind. Note: 16, not 15 — read `node_modules/next/dist/docs/` before writing Next-specific code |
| `CLAUDE.md` | CREATE | Record stack, conventions, and the four gotchas for every later session |
| `.env.local` / `.env.example` | CREATE | `SOCRATA_APP_TOKEN` (server-only, never `NEXT_PUBLIC_`) |
| `lib/nyc/bbl.ts` | CREATE | BBL normalize / decompose / PLUTO-float handling. **The one module that must be tested** |
| `lib/nyc/geosearch.ts` | CREATE | Address → `{bbl, bin, label, matchType}` |
| `lib/nyc/hpdViolations.ts` | CREATE | boro/block/lot query, grouped by class + status |
| `lib/nyc/litigations.ts` | CREATE | `59kj-x8nc` by bbl |
| `lib/nyc/evictions.ts` | CREATE | `6z8x-wfk4` by bbl |
| `lib/nyc/bedbugs.ts` | CREATE | `wz6d-d3jb` by bbl |
| `lib/nyc/dobViolations.ts` | CREATE | `3h2n-5cm9` by bin |
| `lib/nyc/pluto.ts` | CREATE | Units, year built, floors — denominator for normalization |
| `lib/nyc/landlord.ts` | CREATE | `tesw-yqqr` → `feu5-w2e2` → agent-based portfolio |
| `lib/flags.ts` | CREATE | Rule-based flags with **explicitly stated thresholds** (see anti-score note) |
| `app/api/building/[bbl]/route.ts` | CREATE | Server proxy — hides token, fans out, sets `revalidate` |
| `app/page.tsx` | CREATE | Address search + matched-address confirmation |
| `app/building/[bbl]/page.tsx` | CREATE | The report card |
| `app/compare/page.tsx` | CREATE | 2–3 building side-by-side from `localStorage` |
| `fixtures/demo-buildings.json` | CREATE | Cached responses for the 3 demo addresses — offline demo insurance |

---

## Tasks

### Phase 0 — Scaffold + deploy ✅ MOSTLY DONE (2026-09-26)

Done: `create-next-app` (Next 16.3.6 / React 19.2.8, TS, Tailwind, App Router), git repo on `main`,
Vitest wired, `lib/nyc/bbl.ts` + 6 passing tests, all three validation gates green
(`npm test`, `npm run typecheck`, `npm run build`).

**Remaining (human step): connect the repo to Vercel and confirm a public URL loads.**
Teams that defer deploy to hour 30 ship nothing — do this before Phase 2.

Note: `@types/node` was bumped 20 → ^24 to satisfy Vitest 5's peer range. Node local is v24.12.0,
so this is the correct resolution, not a `--legacy-peer-deps` workaround.

### Phase 1 — Data layer (4h)
- **Action**: Build `lib/nyc/*` per the verified table. Start with `bbl.ts`, then `geosearch.ts`,
  then `hpdViolations.ts`. Route all upstream calls through the server handler with the app token.
- **Mirror**: conventions established above — typed result unions, no silent zeros
- **ECC**: `tdd-workflow` skill for `bbl.ts` **only** — padding and float-string bugs are invisible at runtime
- **Validate**: a test asserting `500 W 175 St` → 99 open violations, 58 units, 1.71/unit

### Phase 2 — Building report page (4h)
- **Action**: Search → **show matched address for confirmation** → report card. Every number links to its source dataset.
- **ECC**: `/react-build` or `react-build-resolver` agent if the build breaks
- **Validate**: all three demo addresses render with correct counts

### Phase 3 — Normalization (2h)
- **Action**: per-unit rates + percentile vs neighborhood (same ZIP or block range) median
- **Validate**: reference building shows 1.71/unit and lands in a high percentile

### Phase 4 — Landlord portfolio (3h)
- **Action**: agent-based join from the portfolio section above; aggregate across the portfolio
- **Validate**: LANGSAM agent returns 13 registrations

### Phase 5 — Compare 2–3 buildings (2h)
- **Action**: `localStorage` only. **No auth, no database.**
- **Validate**: survives reload

### Phase 6 — Polish + demo script (2h)
- **Action**: mobile layout (judges use phones), empty states for genuinely clean buildings, write the
  fixtures file, rehearse on three curated addresses: one bad (500 W 175th), one good, one middling
- **ECC**: `/code-review` (pulls `typescript-reviewer` + `react-reviewer`); `a11y-architect` if time
- **Validate**: full run-through on a phone, wifi off, against fixtures

### Stretch — only if ahead of schedule
Map view; rent-stabilization status (DHCR data is messy — do not start this before hour 30).

---

## Explicitly NOT Building

- **No composite 0–100 score.** Judges ask "how did you weight it?" and a black box collapses under
  the question. Use rule-based flags with stated thresholds instead: *"3 flags: >1 open violation per
  unit · active housing-court litigation · prior eviction filing."* Each flag names its own rule.
  More defensible, and more useful to an actual tenant.
- No auth, no database, no ML, no StreetEasy scraping (ToS + time sink).

---

## Validation

```bash
npm run build && npx tsc --noEmit
npm test                       # bbl.ts + fetchers

# Live data smoke test — the whole pipeline in two calls
curl -s "https://geosearch.planninglabs.nyc/v2/search?text=500%20West%20175%20Street%20Manhattan&size=1" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).features[0].properties.addendum.pad))'
# expect: {"bbl":"1021310044","bin":"1063170","version":"26c"}

curl -s "https://data.cityofnewyork.us/resource/wvxf-dwi5.json?\$select=violationstatus,class,count(1)%20as%20n&\$where=boroid='1'%20AND%20block='2131'%20AND%20lot='44'&\$group=violationstatus,class"
# expect Open: B 58, C 27, A 14
```

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Prior art**: JustFix's *Who Owns What* (`whoownswhat.justfix.org`) is built on these same datasets | **High** | Know it before a judge raises it. It is landlord-portfolio-first; this is tenant-decision-first with per-unit normalization and side-by-side comparison. Cite it as prior art — that reads as diligence |
| Silent zeros from the `bbl` trap (gotcha 1) | High | Fetchers return explicit failure, never 0. Assert real counts in tests |
| Socrata throttling mid-demo | High | App token hour 0 + `fixtures/demo-buildings.json` fallback |
| Address→BBL misses / ambiguity | High | Confirm matched address in UI; check GeoSearch `match_type` (the reference lookup returned `fallback`, not `exact`); curate demo addresses |
| PLUTO float-string join failures | Medium | Normalize in `bbl.ts`; unit-test both forms |
| Scope creep into maps | Medium | Phase-gated; maps look nice but carry little information |
| Demo wifi fails | Low | Offline fixtures |

---

## Acceptance

- [ ] Deployed to a public URL in Phase 0, before features
- [ ] `lib/nyc/bbl.ts` tested for padding + PLUTO float forms
- [ ] Reference building reports 99 open violations / 58 units / 1.71 per unit
- [ ] Every displayed number links to its source dataset
- [ ] Landlord portfolio uses the **agent-based** join (13 buildings), not `ownername` (1)
- [ ] No source failure can render as a zero
- [ ] Flags show explicit thresholds; no black-box score
- [ ] Works on a phone, offline, against fixtures
- [ ] Three demo addresses rehearsed: bad / good / middling

---

## ECC Usage Notes for the Next Session

**Recommended entry point**: `/prp-implement .claude/plans/nyc-tenant-building-intelligence.plan.md`

It takes a plan file path directly, detects the package manager, and executes step-by-step with a
validation loop after every change ("never accumulate broken state"). Self-contained — no missing
dependencies.

> **Corrected 2026-09-26.** An earlier draft of this file recommended `/orch-build-mvp`. **That
> command is broken in this install.** The `minimal` profile ships all 94 commands but only 48
> skills, and `/orch-build-mvp` is a thin wrapper whose `orch-build-mvp` skill is not installed
> (it also chains to a missing `gan-build` skill). Verified broken: all five `/orch-*` commands,
> plus `/evolve` (needs `functional-patterns`) and `/jira` (needs `jira-integration`).
> **The other 87 commands are fine.**

**Worth invoking, in order of value:**

| When | ECC surface |
|---|---|
| `lib/nyc/bbl.ts` only | `tdd-workflow` skill |
| Build breaks | `/react-build` or `react-build-resolver` agent |
| Before the demo | `/code-review` → `typescript-reviewer` + `react-reviewer` |
| Between phases | `/checkpoint` |
| Silent-failure audit (high value here — see gotcha 1) | `silent-failure-hunter` agent |
| Mobile/a11y pass, if time | `a11y-architect` agent |

**Skip the rest.** 48 skills and 68 agents are installed; roughly six survive a hackathon clock.
`context-budget` is worth one run if context fills up.

**On "a stronger model":** this plan was written by **Opus 5, which is already the top tier** —
there is no larger model to escalate to. The gain from a new session is a **fresh context window**
and a higher thinking budget, not a bigger model. ECC's `/model-route` can confirm tier choice.
Consider `/fast` off for the data-layer work so reasoning stays deep on the join logic.

**Context cost warning**: this environment has ECC's `minimal` profile installed at user scope,
adding ~13.3k tokens to every session's floor (~27.3k → ~40.6k). Budget accordingly on a Pro plan;
short sessions pay that fixed cost disproportionately.
