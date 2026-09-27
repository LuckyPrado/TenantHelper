/**
 * Tenant rights, selected by what this building's record actually shows.
 *
 * Rule-based, never generated. Every entry is fixed text with an official
 * source link, chosen by a deterministic condition. Nothing here is produced by
 * a model, because wrong housing law is worse than no housing law.
 *
 * Facts verified against nyc.gov on 2026-09-26:
 *  - Heat season runs October 1 to May 31.
 *  - Daytime (6am-10pm), when it is below 55F outside, inside must be >= 68F.
 *  - Overnight (10pm-6am), inside must be >= 62F regardless of outside.
 *  - Hot water must be >= 120F year round.
 *  - HPD classes are A non-hazardous, B hazardous, C immediately hazardous.
 *  - Correction deadlines are set per violation and printed on the Notice of
 *    Violation; there is no single deadline per class. Do not invent one.
 */

import type { BuildingReport } from './nyc/report';

export interface TenantRight {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  /** What the tenant can actually do about it. */
  readonly action: string;
  readonly sourceUrl: string;
  readonly sourceLabel: string;
  /** Why this appeared for this building. */
  readonly because: string;
}

const HEAT_SEASON_START_MONTH = 10;
const HEAT_SEASON_END_MONTH = 5;

/**
 * Heat season runs October 1 to May 31.
 *
 * Deliberately UTC. Local-time month reading is a trap here: `new Date('2026-10-01')`
 * is UTC midnight, which is still September 30 anywhere west of Greenwich, so a
 * local reading reports the wrong month on the exact boundary this function
 * exists to detect. Against NYC local time this flips a few hours early on
 * October 1 and a few hours late on June 1, which does not matter for guidance.
 */
export function isHeatSeason(date: Date): boolean {
  const month = date.getUTCMonth() + 1;
  return month >= HEAT_SEASON_START_MONTH || month <= HEAT_SEASON_END_MONTH;
}

const HPD_HEAT_URL =
  'https://www.nyc.gov/site/hpd/services-and-information/heat-and-hot-water-information.page';
const HPD_VIOLATIONS_URL =
  'https://www.nyc.gov/site/hpd/services-and-information/clear-violations.page';
const HPD_PENALTIES_URL =
  'https://www.nyc.gov/site/hpd/services-and-information/penalties-and-fees.page';
const HEAT_RESOURCES_URL = 'https://www.nyc.gov/site/mayorspeu/resources/heat-season-resources.page';
const NYC311_URL = 'https://portal.311.nyc.gov/';
const HCR_URL = 'https://hcr.ny.gov/';

/**
 * Rights relevant to this building, most urgent first.
 *
 * Every entry states why it appeared, so nothing looks like generic boilerplate
 * bolted onto the page.
 */
export function rightsFor(report: BuildingReport, today: Date = new Date()): readonly TenantRight[] {
  const rights: TenantRight[] = [];
  const openC = report.violations.value?.open.c ?? 0;
  const openTotal = report.violations.value?.open.total ?? 0;
  const litigations = report.litigations.value ?? 0;
  const bedbugs = report.bedbugs.value ?? 0;
  const stabilized = report.stabilization.value?.isStabilized ?? false;

  if (openC > 0) {
    rights.push({
      id: 'class-c',
      title: 'Immediately hazardous conditions must be fixed',
      summary:
        'Class C is HPD’s most serious category — conditions judged an immediate hazard to ' +
        'health or safety. The correction deadline is set per violation and printed on the Notice ' +
        'of Violation, and the owner must certify the repair to HPD.',
      action:
        'Check the open violations on HPD Online for this address. If the deadline has passed and ' +
        'nothing was fixed, report it to 311 — a false certification of correction carries a ' +
        'civil penalty.',
      sourceUrl: HPD_VIOLATIONS_URL,
      sourceLabel: 'HPD: clearing violations',
      because: `${openC.toLocaleString()} open Class C violations on record`,
    });
  }

  if (isHeatSeason(today)) {
    rights.push({
      id: 'heat',
      title: 'Heat and hot water are legally required',
      summary:
        'Heat season runs October 1 to May 31. Between 6am and 10pm, if it is below 55°F ' +
        'outside, your apartment must be at least 68°F. Between 10pm and 6am it must be at ' +
        'least 62°F whatever the weather. Hot water must be at least 120°F all year.',
      action:
        'If your building is below those temperatures, call 311 or file online. HPD can inspect ' +
        'and issue a violation, and the city can bill the owner for emergency repairs.',
      sourceUrl: HPD_HEAT_URL,
      sourceLabel: 'HPD: heat and hot water',
      because: 'It is heat season right now',
    });
  }

  if (bedbugs > 0) {
    rights.push({
      id: 'bedbugs',
      title: 'Bedbug history must be disclosed to you',
      summary:
        'Owners must give every tenant an annual bedbug disclosure covering the past year, and ' +
        'must remediate an infestation. This building has filings on record.',
      action:
        'Ask for the building’s bedbug disclosure before signing. If you are not given one, ' +
        'report it to 311.',
      sourceUrl: NYC311_URL,
      sourceLabel: 'NYC 311',
      because: `${bedbugs.toLocaleString()} bedbug filings on record`,
    });
  }

  if (litigations > 0) {
    rights.push({
      id: 'hp-action',
      title: 'You can take the owner to housing court yourself',
      summary:
        'A tenant can bring an HP Action in Housing Court to force repairs, without a lawyer and ' +
        'with a reduced filing fee. Tenants here have already done so.',
      action:
        'Gather your 311 complaint numbers and HPD violation records first — they are the ' +
        'evidence an HP Action runs on.',
      sourceUrl: HPD_PENALTIES_URL,
      sourceLabel: 'HPD: penalties and enforcement',
      because: `${litigations.toLocaleString()} housing court cases already filed against this building`,
    });
  }

  if (stabilized) {
    rights.push({
      id: 'stabilized',
      title: 'Your rent increase is capped, and you can check your history',
      summary:
        'If your unit is rent stabilized, renewal increases are limited to the Rent Guidelines ' +
        'Board rate, you are entitled to a renewal lease, and you can request the full rent ' +
        'history of the apartment to check for an overcharge.',
      action:
        'Request the rent history from NY State Homes and Community Renewal. It is free and it ' +
        'is the only way to confirm the legal regulated rent.',
      sourceUrl: HCR_URL,
      sourceLabel: 'NY Homes and Community Renewal',
      because: 'This building appears on the rent stabilized list',
    });
  }

  if (openTotal > 0) {
    rights.push({
      id: 'report',
      title: 'Reporting a condition is free and creates a record',
      summary:
        'A 311 complaint triggers an HPD inspection. Even if the repair is slow, the complaint ' +
        'and any resulting violation become part of the building’s public record — the ' +
        'same record this page is built from.',
      action: 'File at 311 online or by phone. You do not need to give your name to report heat.',
      sourceUrl: HEAT_RESOURCES_URL,
      sourceLabel: 'NYC: know your rights',
      because: `${openTotal.toLocaleString()} open violations on record`,
    });
  }

  return rights;
}
