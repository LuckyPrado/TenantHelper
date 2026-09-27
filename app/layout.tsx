import type { Metadata } from 'next';
import { Archivo, Geist_Mono } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'Before you sign — NYC building records',
  description:
    'Look up any NYC address and see the building’s violation record, its landlord’s other buildings, and what the area rents for.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-city-deep text-ink">{children}</body>
    </html>
  );
}
