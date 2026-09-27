/**
 * NYC Rent Guidelines Board allowable increases for rent stabilized apartments.
 *
 * This is what makes a rent projection for a stabilized unit defensible: the
 * increase is a published legal cap, not an extrapolation. CLAUDE.md forbids
 * model-based predictions; a RGB order is a rule, so it is allowed.
 *
 * Every figure below was verified against rentguidelinesboard.cityofnewyork.us
 * on 2026-09-26. Do NOT add orders from memory — these are numbers people may
 * rely on when signing a lease. Verify each one against the RGB site first.
 */

export interface RgbOrder {
  readonly order: number;
  /** Leases commencing on or after this date (inclusive), ISO yyyy-mm-dd. */
  readonly startsOn: string;
  /** Leases commencing on or before this date (inclusive), ISO yyyy-mm-dd. */
  readonly endsOn: string;
  readonly oneYearPct: number;
  readonly twoYearPct: number;
  readonly sourceUrl: string;
}

/** Ordered oldest to newest. Verified 2026-09-26. */
export const RGB_ORDERS: readonly RgbOrder[] = [
  {
    order: 57,
    startsOn: '2025-10-01',
    endsOn: '2026-09-30',
    oneYearPct: 3,
    twoYearPct: 4.5,
    sourceUrl: 'https://rentguidelinesboard.cityofnewyork.us/2025-26-apartment-loft-order-57/',
  },
  {
    order: 58,
    startsOn: '2026-10-01',
    endsOn: '2027-09-30',
    oneYearPct: 0,
    twoYearPct: 0,
    sourceUrl: 'https://rentguidelinesboard.cityofnewyork.us/adopted-summary-of-guidelines-2026-27/',
  },
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The order governing a lease commencing on `date`, or null if outside published guidance. */
export function orderForLeaseStart(date: Date = new Date()): RgbOrder | null {
  const iso = isoDate(date);
  return RGB_ORDERS.find((o) => iso >= o.startsOn && iso <= o.endsOn) ?? null;
}

/** The next published order after `date`, if one exists. */
export function nextOrderAfter(date: Date = new Date()): RgbOrder | null {
  const iso = isoDate(date);
  return RGB_ORDERS.find((o) => o.startsOn > iso) ?? null;
}
