import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isElevenLabsConfigured, synthesiseSpeech } from './elevenlabs';

function audioResponse(bytes = 1024, status = 200): Response {
  return new Response(new Uint8Array(bytes), { status });
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  process.env.ELEVENLABS_API_KEY = 'test-key';
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;
});

describe('synthesiseSpeech', () => {
  it('posts the text and returns the audio bytes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse(2048));

    const result = await synthesiseSpeech('This building has 430 open violations.', fetchImpl);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.byteLength).toBe(2048);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v1\/text-to-speech\/21m00Tcm4TlvDq8ikWAM$/);
    expect(JSON.parse(init.body as string).model_id).toBe('eleven_flash_v2_5');
  });

  it('sends the key as a header, never in the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse());

    await synthesiseSpeech('hello', fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).not.toMatch(/test-key/);
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('test-key');
  });

  it('honours a configured voice override', async () => {
    process.env.ELEVENLABS_VOICE_ID = 'custom-voice';
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse());

    await synthesiseSpeech('hello', fetchImpl);

    expect(fetchImpl.mock.calls[0][0]).toMatch(/custom-voice$/);
  });

  it('refuses an oversized string rather than spending the credits', async () => {
    const fetchImpl = vi.fn();

    const result = await synthesiseSpeech('x'.repeat(5000), fetchImpl);

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses empty text', async () => {
    const fetchImpl = vi.fn();

    expect((await synthesiseSpeech('   ', fetchImpl)).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails cleanly with no key', async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const fetchImpl = vi.fn();

    expect((await synthesiseSpeech('hello', fetchImpl)).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('explains that a 401 is usually a missing scope', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse(0, 401));

    const result = await synthesiseSpeech('hello', fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Text to Speech scope/);
  });

  it('treats empty audio as a failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(audioResponse(0));

    expect((await synthesiseSpeech('hello', fetchImpl)).ok).toBe(false);
  });
});

describe('isElevenLabsConfigured', () => {
  it('is false for a blank key', () => {
    process.env.ELEVENLABS_API_KEY = '  ';
    expect(isElevenLabsConfigured()).toBe(false);
  });
});
