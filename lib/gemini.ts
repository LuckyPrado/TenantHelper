/**
 * Plain-English summary of a building's record, via the Gemini API.
 *
 * SERVER ONLY. Reads GEMINI_API_KEY and never exposes it to the client.
 *
 * ⚠️ Grounding is the whole design. The model is given a fact sheet built from
 * data we already fetched and verified, and is instructed to use nothing else.
 * It does not answer legal questions and it does not receive the tenant-rights
 * text — those stay rule-based in lib/rights.ts, because invented housing law
 * is the one failure mode that could actually harm someone.
 *
 * Uses the REST endpoint rather than @google/genai: one call does not justify a
 * dependency, and this keeps the same Result<T> and timeout handling as every
 * other fetcher in the project.
 */

import type { Grade } from './grade';
import { fail, ok, type Result } from './nyc/result';
import type { BuildingReport } from './nyc/report';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL = 'gemini-3.8-flash';
const TIMEOUT_MS = 15_000;
const MAX_OUTPUT_TOKENS = 320;

const SYSTEM_INSTRUCTION = [
  'You explain New York City building records to someone deciding whether to rent an apartment.',
  '',
  'Rules you must follow:',
  '- Use ONLY the facts in the FACTS block. Never add statistics, addresses, dates, laws or',
  '  agency names that are not there.',
  '- If a fact is marked unavailable, say it is unknown. Never guess or fill it in.',
  '- Do NOT give legal advice, quote housing law, or state deadlines. The page already shows',
  '  the tenant a separate, sourced rights section; your job is only to explain the numbers.',
  '- Plain language, no jargon. Explain what a figure means for someone living there.',
  '- 3 to 4 sentences, under 90 words. No headings, no bullet points, no preamble.',
  '- Be direct about a bad record and equally direct about a good one. Do not hedge.',
].join('\n');

/**
 * The only information the model receives. Every line is a value we fetched and
 * verified; anything unavailable is stated as unknown rather than omitted, so
 * the model cannot quietly treat a gap as a zero.
 */
export function buildFactSheet(report: BuildingReport, grade: Grade | null): string {
  const facts = report.facts.value;
  const violations = report.violations.value;
  const rent = report.areaRent.value;
  const stabilization = report.stabilization.value;
  const landlord = report.landlord.value;

  const unknown = (label: string) => `${label}: unavailable`;
  const lines: string[] = [];

  lines.push(`Address: ${facts?.address ?? 'unknown'}`);
  lines.push(
    facts
      ? `Residential units: ${facts.unitsRes}${facts.yearBuilt !== null ? `, built ${facts.yearBuilt}` : ''}`
      : unknown('Residential units'),
  );

  if (violations !== null && report.openViolationsPerUnit !== null) {
    lines.push(
      `Open housing violations: ${violations.open.total} total ` +
        `(${violations.open.c} immediately hazardous, ${violations.open.b} hazardous, ` +
        `${violations.open.a} non-hazardous)`,
      `Open violations per apartment: ${report.openViolationsPerUnit.toFixed(2)}`,
      `Previously resolved violations: ${violations.closed.total}`,
    );
  } else {
    lines.push(unknown('Open housing violations'));
  }

  lines.push(
    report.litigations.value !== null
      ? `Housing court cases against this building: ${report.litigations.value}`
      : unknown('Housing court cases'),
    report.evictions.value !== null
      ? `Evictions carried out here: ${report.evictions.value}`
      : unknown('Evictions'),
    report.bedbugs.value !== null
      ? `Bedbug filings: ${report.bedbugs.value}`
      : unknown('Bedbug filings'),
  );

  if (grade !== null) {
    lines.push(`Overall grade assigned by this site: ${grade.letter} (${grade.points} of ${grade.maxPoints} risk points)`);
  }

  lines.push(
    rent !== null
      ? `Typical rent in this ZIP code (${rent.zip}): $${Math.round(rent.latest.rent)} per month` +
          (rent.yearOverYearPct !== null
            ? `, ${rent.yearOverYearPct >= 0 ? 'up' : 'down'} ${Math.abs(rent.yearOverYearPct).toFixed(1)}% in the last year`
            : '')
      : unknown('Typical rent in this ZIP code'),
  );

  lines.push(
    stabilization !== null
      ? `Rent stabilized: ${stabilization.isStabilized ? 'yes, appears on the stabilized list' : 'not on the stabilized list'}`
      : unknown('Rent stabilization status'),
  );

  if (landlord?.portfolioKey != null) {
    const others = landlord.portfolio.filter((b) => b.bbl !== report.bbl).length;
    lines.push(
      `Managing company: ${landlord.portfolioKey.name}, which runs ${others} other buildings` +
        (landlord.portfolioOpenViolations !== null
          ? ` with ${landlord.portfolioOpenViolations} open violations between them`
          : ''),
    );
  }

  return lines.join('\n');
}

interface InteractionResponse {
  readonly output_text?: unknown;
  readonly output?: readonly { readonly content?: readonly { readonly text?: unknown }[] }[];
}

/** Pull the text out defensively — `output_text` is the documented field. */
function extractText(body: InteractionResponse): string | null {
  if (typeof body.output_text === 'string' && body.output_text.trim() !== '') {
    return body.output_text.trim();
  }
  const blocks = body.output?.flatMap((o) => o.content ?? []) ?? [];
  const joined = blocks
    .map((b) => (typeof b.text === 'string' ? b.text : ''))
    .join('')
    .trim();
  return joined === '' ? null : joined;
}

export function isGeminiConfigured(): boolean {
  return (process.env.GEMINI_API_KEY ?? '').trim() !== '';
}

/**
 * Summarise one building in plain English.
 *
 * Returns a failure rather than throwing, so the page renders without the
 * summary if the key is missing, the request times out, or the model is down.
 */
export async function summariseBuilding(
  report: BuildingReport,
  grade: Grade | null,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<string>> {
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  if (apiKey === '') return fail('GEMINI_API_KEY is not set.');

  const facts = buildFactSheet(report, grade);
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        system_instruction: SYSTEM_INSTRUCTION,
        input: `FACTS\n${facts}\n\nExplain what this record means for someone thinking of renting here.`,
        generation_config: { temperature: 0.2, max_output_tokens: MAX_OUTPUT_TOKENS },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail(`Gemini request failed (${detail})`);
  }

  if (!response.ok) return fail(`Gemini: HTTP ${response.status}`);

  let body: InteractionResponse;
  try {
    body = (await response.json()) as InteractionResponse;
  } catch {
    return fail('Gemini returned an unreadable response.');
  }

  const text = extractText(body);
  if (text === null) return fail('Gemini returned no text.');

  console.info(`[nyc] gemini summary bbl=${report.bbl} ${Date.now() - startedAt}ms`);
  return ok(text);
}
