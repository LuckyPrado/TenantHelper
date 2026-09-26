/** HPD Housing Litigations — dataset 59kj-x8nc. Has a real `bbl` column. */
import { makeBblCountFetcher } from './bblCount';

export const LITIGATIONS_DATASET = '59kj-x8nc';

/** Housing-court cases filed against this building. Verified: 15 for BBL 1021310044. */
export const fetchLitigationCount = makeBblCountFetcher(LITIGATIONS_DATASET);
