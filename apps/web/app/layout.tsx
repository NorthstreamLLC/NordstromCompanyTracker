import type { Metadata } from 'next';
import './globals.css';
import { StoreProvider } from '@/lib/store';
import { Shell } from '@/components/Shell';

export const metadata: Metadata = {
  title: 'FinScope — Household & Business Tracker',
  description: 'One organised view of household and business finances.',

  // Belt and braces alongside robots.ts. robots.txt asks crawlers not to fetch;
  // a noindex header is what actually keeps a page out of the index if it gets
  // discovered another way — an inbound link, for instance. A URL blocked only
  // by robots.txt can still be indexed on the strength of external links, which
  // is exactly the outcome we do not want for a logged-in app.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <StoreProvider>
          <Shell>{children}</Shell>
        </StoreProvider>
      </body>
    </html>
  );
}
