# DivHacks — NYC Tenant Building Intelligence

Web app: enter a NYC address → sourced report on the building's condition and its landlord's
track record, so a prospective tenant can decide whether to sign.

**Full plan:** `.claude/plans/nyc-tenant-building-intelligence.plan.md` — read it before
implementing. It carries every verified endpoint, dataset ID, and field name.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Vercel. **No database, no auth.**
Socrata calls go through server route handlers so `SOCRATA_APP_TOKEN` never reaches the client.

## ⚠️ Four dataset traps — do not rediscover these

1. **HPD violations (`wvxf-dwi5`) has NO `bbl` column, and filtering on `bbl` FAILS SILENTLY** —
   returns `count: 0` instead of an error, which would report every building as spotless.
   Use `boroid='1' AND block='2131' AND lot='44'` (unpadded strings).
2. **PLUTO (`64uk-42ks`) returns `bbl` as a float string**: `"1021310044.00000000"`. Normalize both sides.
3. **HPD Complaints (`uwyv-629c`) is auth-gated** — *"You must be logged in."* Don't depend on it.
4. **Socrata throttles without an app token.** Send `X-App-Token` on every call.

## Join key

`geosearch.planninglabs.nyc/v2/search?text=<addr>&size=1` → `features[0].properties.addendum.pad.bbl`
No API key. This is the entry point for every other lookup.

## Reference building — assert against these exact numbers

**500 W 175th St** · `bbl=1021310044` · `bin=1063170`

| Signal | Value |
|---|---|
| Open HPD violations | 99 (58 B, 27 C, 14 A) |
| Litigations / evictions / bedbugs | 15 / 3 / 8 |
| DOB violations | 19 |
| Units / built | 58 / 1911 |
| **Open violations per unit** | **1.71** ← the product's core metric |

## Landlord portfolio: use the agent join, not the owner join

NYC landlords use one LLC per building by design. PLUTO `ownername` → **1** building.
HPD contacts (`feu5-w2e2`) on managing agent → **13**. Always use the agent/officer join.

## Conventions

- One module per data source in `lib/nyc/`, each taking a normalized `Bbl`
- **Every fetcher returns `{ ok: true, data } | { ok: false, reason }`. A failed source must never
  render as zero** — that is the same silent-failure class as trap 1
- Tests (Vitest, colocated): `lib/nyc/bbl.ts` and the fetchers only
- Server handlers log dataset id + key + ms per upstream call

## Product rules

- **No composite 0–100 score.** Rule-based flags with explicitly stated thresholds instead
  ("2 flags: >1 open violation/unit · active litigation"). A black box collapses when a judge asks
  how it's weighted.
- Every number displayed links to its source dataset.
- Prior art: JustFix *Who Owns What* uses the same data. Know it. We're tenant-decision-first with
  per-unit normalization; it's landlord-portfolio-first.

## ECC notes

- Entry point: `/prp-implement .claude/plans/nyc-tenant-building-intelligence.plan.md`
- Worth using: `tdd-workflow` (for `bbl.ts` only) · `silent-failure-hunter` (after the data layer —
  high value given trap 1) · `/react-build` · `/code-review` · `/checkpoint`
- **Broken in this install** (commands present, skills absent): all five `/orch-*`, `/evolve`, `/jira`.
  The other 87 commands work.
