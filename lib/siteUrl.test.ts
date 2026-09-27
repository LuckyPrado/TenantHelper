import { describe, expect, it } from 'vitest';
import { resolveSiteUrl } from './siteUrl';

describe('resolveSiteUrl', () => {
  it('prefers an explicit override', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://knowurbuilding.tech' })).toBe(
      'https://knowurbuilding.tech',
    );
  });

  it("adds the scheme Vercel's production URL leaves off", () => {
    // VERCEL_PROJECT_PRODUCTION_URL is a bare host. new URL() throws on it, so
    // a missing scheme would fail the whole build rather than one link.
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'knowurbuilding.tech' })).toBe(
      'https://knowurbuilding.tech',
    );
  });

  it('strips a trailing slash so joined paths never double up', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://example.tech/' })).toBe(
      'https://example.tech',
    );
  });

  it('falls back to localhost when neither is set', () => {
    expect(resolveSiteUrl({})).toBe('http://localhost:3000');
  });

  it('treats an empty string as unset rather than as an origin', () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: '', VERCEL_PROJECT_PRODUCTION_URL: '' })).toBe(
      'http://localhost:3000',
    );
  });

  it('always produces something new URL() accepts', () => {
    for (const env of [
      {},
      { VERCEL_PROJECT_PRODUCTION_URL: 'a-b-c.vercel.app' },
      { NEXT_PUBLIC_SITE_URL: 'http://localhost:4000' },
    ]) {
      expect(() => new URL(resolveSiteUrl(env))).not.toThrow();
    }
  });
});
