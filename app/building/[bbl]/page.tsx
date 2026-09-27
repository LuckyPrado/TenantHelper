import Link from 'next/link';
import { GradeCard } from '@/components/GradeCard';
import { LandlordPortfolio } from '@/components/LandlordPortfolio';
import { RentTrend } from '@/components/RentTrend';
import { StabilizationCard } from '@/components/StabilizationCard';
import { StatCard } from '@/components/StatCard';
import { normalizeBbl } from '@/lib/nyc/bbl';
import { gradeBuilding } from '@/lib/grade';
import { buildBuildingReport } from '@/lib/nyc/report';

/** Socrata data updates daily at best; an hour of caching costs nothing and protects the demo. */
export const revalidate = 3600;

function PerUnitHeadline({
  perUnit,
  openTotal,
  units,
}: {
  readonly perUnit: number;
  readonly openTotal: number;
  readonly units: number;
}) {
  const severe = perUnit >= 1;

  return (
    <section
      className={`rounded-xl border p-6 ${
        severe ? 'border-red-500/50 bg-red-500/5' : 'border-emerald-500/40 bg-emerald-500/5'
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide opacity-60">
        Open violations per apartment
      </div>
      <div className="mt-1 text-5xl font-semibold tabular-nums sm:text-6xl">
        {perUnit.toFixed(2)}
      </div>
      <p className="mt-2 text-sm opacity-70">
        {openTotal.toLocaleString()} open HPD violations across {units.toLocaleString()}{' '}
        residential {units === 1 ? 'unit' : 'units'}.
      </p>
    </section>
  );
}

export default async function BuildingPage({ params, searchParams }: PageProps<'/building/[bbl]'>) {
  const { bbl: rawBbl } = await params;
  const { bin: rawBin, label: rawLabel } = await searchParams;

  let bbl: string;
  try {
    bbl = normalizeBbl(rawBbl);
  } catch {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-16">
        <p className="rounded-md border border-red-500/40 bg-red-500/5 p-4 text-sm">
          {rawBbl} is not a valid BBL.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm underline">
          Search again
        </Link>
      </main>
    );
  }

  const bin = typeof rawBin === 'string' ? rawBin : null;
  const label = typeof rawLabel === 'string' ? rawLabel : null;
  const report = await buildBuildingReport(bbl, bin);
  const facts = report.facts.value;
  const grade = gradeBuilding(report);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 sm:py-14">
      <Link href="/" className="text-sm underline opacity-60 hover:opacity-100">
        ← New search
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        {label ?? facts?.address ?? `BBL ${bbl}`}
      </h1>
      <p className="mt-1 text-sm opacity-60">
        BBL {bbl}
        {bin !== null && ` · BIN ${bin}`}
        {facts?.yearBuilt != null && ` · built ${facts.yearBuilt}`}
        {facts !== null && ` · ${facts.unitsRes} residential units`}
      </p>

      <div className="mt-8">
        {report.openViolationsPerUnit !== null && report.violations.value !== null && facts !== null ? (
          <PerUnitHeadline
            perUnit={report.openViolationsPerUnit}
            openTotal={report.violations.value.open.total}
            units={facts.unitsRes}
          />
        ) : (
          <section className="rounded-xl border border-black/10 p-6 dark:border-white/15">
            <div className="text-xs font-medium uppercase tracking-wide opacity-60">
              Open violations per apartment
            </div>
            <div className="mt-1 text-3xl font-semibold opacity-50">Unavailable</div>
            <p className="mt-2 text-sm opacity-70">
              {report.violations.error ?? report.facts.error ?? 'Missing data.'}
            </p>
          </section>
        )}
      </div>

      <div className="mt-6">
        <GradeCard grade={grade} />
      </div>

      {report.violations.value !== null && (
        <section className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide opacity-60">
            Open violations by hazard class
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {(
              [
                ['Class A', report.violations.value.open.a, 'Non-hazardous'],
                ['Class B', report.violations.value.open.b, 'Hazardous'],
                ['Class C', report.violations.value.open.c, 'Immediately hazardous'],
              ] as const
            ).map(([name, count, meaning]) => (
              <div key={name} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
                <div className="text-xs uppercase tracking-wide opacity-60">{name}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{count}</div>
                <div className="mt-1 text-xs opacity-60">{meaning}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs opacity-60">
            {report.violations.value.closed.total.toLocaleString()} previously resolved.
          </p>
        </section>
      )}

      <div className="mt-6">
        <RentTrend source={report.areaRent} />
      </div>

      <div className="mt-6">
        <StabilizationCard source={report.stabilization} areaRent={report.areaRent} />
      </div>

      <div className="mt-6">
        <LandlordPortfolio source={report.landlord} currentBbl={bbl} />
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide opacity-60">
          Other public records
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            label="Housing court cases"
            source={report.litigations}
            datasetId="59kj-x8nc"
            datasetName="HPD Housing Litigations"
            emphasis={(report.litigations.value ?? 0) > 0}
          />
          <StatCard
            label="Evictions"
            source={report.evictions}
            datasetId="6z8x-wfk4"
            datasetName="DOI Marshals' Evictions"
            emphasis={(report.evictions.value ?? 0) > 0}
          />
          <StatCard
            label="Bedbug filings"
            source={report.bedbugs}
            datasetId="wz6d-d3jb"
            datasetName="Bedbug Reporting"
          />
          <StatCard
            label="DOB violations"
            source={report.dobViolations}
            datasetId="3h2n-5cm9"
            datasetName="DOB Violations"
          />
        </div>
      </section>

      <footer className="mt-10 border-t border-black/10 pt-4 text-xs opacity-50 dark:border-white/15">
        Sourced from NYC Open Data. Figures reflect public filings, not an inspection, and may lag
        or contain errors. Checked {new Date(report.generatedAt).toLocaleString('en-US')}.
      </footer>
    </main>
  );
}
