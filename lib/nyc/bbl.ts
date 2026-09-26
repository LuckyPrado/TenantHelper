/**
 * BBL (Borough-Block-Lot) normalization.
 *
 * This module exists because two NYC data sources disagree on BBL's shape, and
 * getting it wrong fails SILENTLY rather than loudly:
 *
 *  - GeoSearch returns a clean 10-char string: "1021310044"
 *  - PLUTO returns a float string:             "1021310044.00000000"
 *  - HPD violations has NO bbl column at all — it needs boroid/block/lot as
 *    UNPADDED strings, and filtering it on `bbl` returns count 0 instead of an
 *    error, which would report every building as spotless.
 *
 * See CLAUDE.md "Four dataset traps".
 */

export type Bbl = string & { readonly __brand: 'Bbl' };

/** Accepts GeoSearch ("1021310044") or PLUTO ("1021310044.00000000") form. */
export function normalizeBbl(input: string): Bbl {
  const digits = input.trim().split('.')[0].replace(/\D/g, '');
  if (digits.length !== 10) {
    throw new Error(`Invalid BBL ${JSON.stringify(input)}: expected 10 digits, got ${digits.length}`);
  }
  if (digits[0] < '1' || digits[0] > '5') {
    throw new Error(`Invalid BBL ${JSON.stringify(input)}: borough digit must be 1-5`);
  }
  return digits as Bbl;
}

/**
 * Split a BBL into the unpadded parts HPD datasets expect.
 * BBL 1021310044 -> { boroid: '1', block: '2131', lot: '44' }
 */
export function decomposeBbl(bbl: string): { boroid: string; block: string; lot: string } {
  const n = normalizeBbl(bbl);
  return {
    boroid: n.slice(0, 1),
    block: String(Number(n.slice(1, 6))),
    lot: String(Number(n.slice(6))),
  };
}
