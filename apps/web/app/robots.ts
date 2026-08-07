import type { MetadataRoute } from 'next';

/**
 * The app subdomain is deliberately excluded from search entirely.
 *
 * Every page here is either a logged-in view or a workspace shell — there is
 * nothing a searcher could usefully land on, and letting Google index them
 * creates thin, duplicate-looking pages competing with the marketing page that
 * you actually want to rank. One indexable page, on the main domain, carrying
 * the SoftwareApplication markup.
 *
 * Note this blocks crawling, not access. It has no bearing on security — that
 * is what the row-level security policies are for.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
