/**
 * Text-to-speech narration of a building summary, via ElevenLabs.
 *
 * SERVER ONLY. Reads ELEVENLABS_API_KEY and never exposes it to the client.
 *
 * Why this exists: a dense violations report excludes people who cannot easily
 * read it. 10033 — the demo ZIP — is heavily Spanish-speaking with a wide range
 * of literacy, and those are exactly the tenants most likely to be living with
 * an open Class C violation. Audio is an accessibility feature here, not a
 * novelty, which is also why the model chosen is multilingual.
 *
 * Credits are the constraint. Each summary is ~400 characters and the free tier
 * is capped monthly, so responses are cached hard and the demo buildings are
 * pre-warmed. Nothing regenerates audio that already exists.
 */

import { fail, ok, type Result } from './nyc/result';

const API_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';

/**
 * Flash v2.5: lowest latency and lowest credit cost of the TTS models on this
 * account, and multilingual — which is the point. Verified present via
 * GET /v1/models on 2026-09-27.
 */
const MODEL_ID = 'eleven_flash_v2_5';

/**
 * River — "relaxed, neutral, informative". Chosen from the account's voices to
 * match the product's stance: state the facts and let the reader conclude. A
 * warmer or more dramatic voice would editorialise a record that is often
 * alarming on its own. Overridable via ELEVENLABS_VOICE_ID.
 */
const DEFAULT_VOICE_ID = 'SAz9YHcvj6GT2YYXdXww';

const TIMEOUT_MS = 30_000;

/** Guards against a malformed summary burning a large number of credits. */
const MAX_CHARS = 1200;

/**
 * Accepts either name. ELEVENLABS_API_KEY is canonical, but ELEVEN_API_KEY is
 * what the ElevenLabs dashboard suggests and is easy to end up with; reading
 * only one of them produces a 401 that looks exactly like a missing scope.
 */
function apiKey(): string {
  return (process.env.ELEVENLABS_API_KEY ?? process.env.ELEVEN_API_KEY ?? '').trim();
}

export function isElevenLabsConfigured(): boolean {
  return apiKey() !== '';
}

function voiceId(): string {
  const configured = (process.env.ELEVENLABS_VOICE_ID ?? '').trim();
  return configured === '' ? DEFAULT_VOICE_ID : configured;
}

/**
 * Synthesise speech from text.
 *
 * Returns the raw MP3 bytes, or a failure — never throws, so a missing key,
 * an exhausted quota or a timeout costs the page a button rather than a render.
 */
export async function synthesiseSpeech(
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<ArrayBuffer>> {
  const key = apiKey();
  if (key === '') return fail('ELEVENLABS_API_KEY (or ELEVEN_API_KEY) is not set.');

  const trimmed = text.trim();
  if (trimmed === '') return fail('Nothing to narrate.');
  if (trimmed.length > MAX_CHARS) {
    return fail(`Refusing to narrate ${trimmed.length} characters (cap is ${MAX_CHARS}).`);
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE}/${voiceId()}`, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text: trimmed, model_id: MODEL_ID }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail(`ElevenLabs request failed (${detail})`);
  }

  if (!response.ok) {
    // 401 here usually means the key lacks the Text to Speech scope rather
    // than being invalid — ElevenLabs returns 401 for both.
    const hint = response.status === 401 ? ' (check the key has the Text to Speech scope)' : '';
    return fail(`ElevenLabs: HTTP ${response.status}${hint}`);
  }

  const audio = await response.arrayBuffer();
  if (audio.byteLength === 0) return fail('ElevenLabs returned empty audio.');

  console.info(
    `[nyc] tts ${trimmed.length} chars -> ${audio.byteLength} bytes in ${Date.now() - startedAt}ms`,
  );
  return ok(audio);
}
