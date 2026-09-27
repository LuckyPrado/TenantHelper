import type { Metadata } from 'next';
import { Archivo, Geist_Mono } from 'next/font/google';
import { CityMap } from '@/components/map/CityMap';
import { resolveSiteUrl } from '@/lib/siteUrl';
import './globals.css';

/*
  Archivo: a grotesque in the lineage of transit and municipal signage, which is
  the vernacular this product lives in. Chosen over the house default because
  the report is meant to read as an official record, not a SaaS dashboard.
  Geist Mono is kept for one job only — serial numbers (BBL, BIN) where digit
  alignment is genuinely load-bearing.
*/
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

const SITE_URL = resolveSiteUrl();
const DESCRIPTION =
  'Look up any NYC address and see the building’s violation record, its landlord’s other buildings, and what the area rents for.';

export const metadata: Metadata = {
  // Absolute base for canonical links and Open Graph. Comes from the
  // deployment rather than a constant, so attaching the custom domain is a DNS
  // change and nothing in the code.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Know Your Building — NYC building records',
    template: '%s · Know Your Building',
  },
  description: DESCRIPTION,
  applicationName: 'Know Your Building',
  openGraph: {
    type: 'website',
    siteName: 'Know Your Building',
    title: 'Know Your Building',
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Know Your Building',
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* The map is mounted once here, not per page, so it survives
          client-side navigation — that continuity between searching, reading a
          record and coming back is the point of the design. */}
      <body className="min-h-full text-ink">
        <CityMap />
        {children}
      </body>
    </html>
  );
}
