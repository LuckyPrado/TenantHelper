/** Bedbug Reporting — dataset wz6d-d3jb. Has a real `bbl` column. */
import { makeBblCountFetcher } from './bblCount';

export const BEDBUGS_DATASET = 'wz6d-d3jb';

/** Bedbug infestation filings. Verified: 8 for BBL 1021310044. */
export const fetchBedbugCount = makeBblCountFetcher(BEDBUGS_DATASET);
