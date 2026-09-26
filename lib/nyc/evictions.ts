/** DOI Marshals' Evictions — dataset 6z8x-wfk4. Has a real `bbl` column. */
import { makeBblCountFetcher } from './bblCount';

export const EVICTIONS_DATASET = '6z8x-wfk4';

/** Executed evictions at this building. Verified: 3 for BBL 1021310044. */
export const fetchEvictionCount = makeBblCountFetcher(EVICTIONS_DATASET);
