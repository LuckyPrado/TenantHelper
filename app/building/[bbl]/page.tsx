import { Suspense } from 'react';
import Link from 'next/link';
import { BuildingSummary, SummarySkeleton } from '@/components/BuildingSummary';
import { GradeCard } from '@/components/GradeCard';
import { LandlordPortfolio } from '@/components/LandlordPortfolio';
import { RentTrend } from '@/components/RentTrend';
import { StabilizationCard } from '@/components/StabilizationCard';
import { TenantRights } from '@/components/TenantRights';
import { BuildingMap } from '@/components/BuildingMap';
import { Masthead } from '@/components/doc/Masthead';
import { Row, Section, Sheet, Unknown } from '@/components/doc/primitives';
import { gradeBuilding } from '@/lib/grade';
import { normalizeBbl } from '@/lib/nyc/bbl';
import { buildBuildingReport, type SourceValue } from '@/lib/nyc/report';
import { rightsFor } from '@/lib/rights';

/** Socrata data updates daily at best; an hour of caching costs nothing and protects the demo. */
export const revalidate = 3600;

const DATASET = (id: string) => `https://data.cityofnewyork.us/d/${id}`;

/** Renders a count, or says plainly that we could not find out. Never zero. */
function count(source: SourceValue<number>) {
  return source.value === null ? <Unknown reason={source.error} /> : source.value.toLocaleString();
}

export default async function BuildingPage({ params, searchParams }: PageProps<'/building/[bbl]'>) {
  const { bbl: rawBbl } = await params;
  const { bin: rawBin, label: rawLabel } = await searchParams;

  let bbl: string;
  try {
    bbl = normalizeBbl(rawBbl);
  } catch {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 py-16">
        <Sheet className="p-6">
          <p className="text-[0.95rem] text-class-c">{rawBbl} is not a valid NYC tax lot number.</p>
          <Link href="/" className="mt-4 inline-block text-[0.9rem] text-ink underline">
            Search again
          </Link>
        </Sheet>
      </main>
    );
  }

  const bin = typeof rawBin === 'string' ? rawBin : null;
  const label = typeof rawLabel === 'string' ? rawLabel : null;
  const report = await buildBuildingReport(bbl, bin);
  const facts = report.facts.value;
  const grade = gradeBuilding(report);
  const rights = rightsFor(report);
  const open = report.violations.value?.open;
  const footprint = report.footprint.value;

  return (
    <div className="min-h-screen bg-city-deep">
      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-5 sm:py-8">
        <Link
          href="/"
          className="mb-3 inline-block text-[0.85rem] text-paper-edge underline underline-offset-2 hover:text-paper"
        >
          New search
        </Link>

        {footprint !== null && (
          <div className="mb-[-1.5rem] sm:mb-[-2rem]">
            <BuildingMap
              centre={footprint.centre}
              geometry={footprint.geometry}
              heightFt={footprint.heightFt}
              label={label ?? facts?.address ?? bbl}
            />
          </div>
        )}

        <Sheet className="relative">
          <Masthead
            address={label ?? facts?.address ?? `Tax lot ${bbl}`}
            bbl={bbl}
            bin={bin}
            facts={facts}
            perUnit={report.openViolationsPerUnit}
            openTotal={open?.total ?? null}
            grade={grade}
            unavailableReason={report.violations.error ?? report.facts.error}
          />

          <Suspense fallback={<SummarySkeleton />}>
            <BuildingSummary report={report} grade={grade} />
          </Suspense>

          {open !== undefined && (
            <Section
              title="Open violations"
              aside={`${report.violations.value?.closed.total.toLocaleString()} previously resolved`}
            >
              <Row
                label="Class C"
                note="immediately hazardous"
                value={open.c.toLocaleString()}
                tone="c"
                source={{ href: DATASET('wvxf-dwi5'), label: 'HPD' }}
              />
              <Row label="Class B" note="hazardous" value={open.b.toLocaleString()} tone="b" />
              <Row label="Class A" note="non-hazardous" value={open.a.toLocaleString()} tone="a" />
            </Section>
          )}

          <Section title="Enforcement record">
            <Row
              label="Housing court cases"
              value={count(report.litigations)}
              tone={(report.litigations.value ?? 0) > 0 ? 'c' : 'clear'}
              source={{ href: DATASET('59kj-x8nc'), label: 'HPD litigations' }}
            />
            <Row
              label="Evictions carried out"
              value={count(report.evictions)}
              tone={(report.evictions.value ?? 0) > 0 ? 'b' : 'clear'}
              source={{ href: DATASET('6z8x-wfk4'), label: 'DOI marshals' }}
            />
            <Row
              label="Bedbug filings"
              value={count(report.bedbugs)}
              tone={(report.bedbugs.value ?? 0) > 0 ? 'b' : 'clear'}
              source={{ href: DATASET('wz6d-d3jb'), label: 'HPD' }}
            />
            <Row
              label="Buildings Department violations"
              value={count(report.dobViolations)}
              tone={(report.dobViolations.value ?? 0) > 0 ? 'b' : 'clear'}
              source={{ href: DATASET('3h2n-5cm9'), label: 'DOB' }}
            />
          </Section>

          <RentTrend source={report.areaRent} />
          <StabilizationCard source={report.stabilization} areaRent={report.areaRent} />
          <LandlordPortfolio source={report.landlord} currentBbl={bbl} />
          <GradeCard grade={grade} />
          <TenantRights rights={rights} />

          <footer className="rule px-5 py-4 text-[0.72rem] leading-snug text-ink-faint sm:px-7">
            Compiled from NYC Open Data. These are public filings, not an inspection, and they can
            lag or contain errors. Checked {new Date(report.generatedAt).toLocaleString('en-US')}.
          </footer>
        </Sheet>
      </main>
    </div>
  );
}
