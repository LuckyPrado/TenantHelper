import { Landing } from '@/components/map/Landing';

export const metadata = {
  title: 'Know Your Building — NYC building records',
  description:
    'Every building in New York has a public record. Read it before you sign the lease.',
};

/**
 * The landing screen is the city itself, mounted by the root layout. This page
 * contributes only the overlay that floats on top of it.
 */
export default function HomePage() {
  return <Landing />;
}
