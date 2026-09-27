/**
 * The canonical origin for this deployment.
 *
 * Next needs an absolute base before it can resolve Open Graph images and
 * canonical links; without one it warns at build time and emits relative URLs
 * that no link preview can follow.
 *
 * Resolved rather than hardcoded so attaching a custom domain is a DNS change
 * and nothing else:
 *  1. NEXT_PUBLIC_SITE_URL, when someone wants to force it.
 *  2. VERCEL_PROJECT_PRODUCTION_URL — Vercel sets this to the project's
 *     production domain, which becomes the custom domain once one is attached.
 *     Note it carries no scheme.
 *  3. localhost, for development.
 */

const DEV_ORIGIN = 'http://localhost:3000';

function withScheme(host: string): string {
  return /^https?:\/\//.test(host) ? host : `https://${host}`;
}

export function resolveSiteUrl(
  env: Partial<Record<string, string>> = process.env,
): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit !== undefined && explicit !== '') return withScheme(explicit).replace(/\/+$/, '');

  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production !== undefined && production !== '') {
    return withScheme(production).replace(/\/+$/, '');
  }

  return DEV_ORIGIN;
}
