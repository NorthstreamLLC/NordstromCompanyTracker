# Connecting the app to your website

## Shape

```
nordstromcompany.com/finscope     ← marketing page. Indexed. Carries the schema.
app.nordstromcompany.com          ← the tool itself. noindex, no crawl.
```

One indexable page competing for the query, on the main domain where its links
build your existing authority. The app subdomain stays out of the index because
every page there is a logged-in view — thin, near-duplicate, and nothing a
searcher could usefully land on.

## Pointing the subdomain at Vercel

1. Vercel → the `nordstrom-company-tracker-web` project → **Settings → Domains**
2. Add `app.nordstromcompany.com`
3. Vercel shows a DNS record. At your registrar, add:

   | Type  | Name  | Value                  |
   |-------|-------|------------------------|
   | CNAME | `app` | `cname.vercel-dns.com` |

4. Wait for propagation (usually minutes). Vercel issues the TLS certificate
   automatically.

Nothing about your existing site changes. Deployments keep working exactly as
now — push to `main`, Vercel rebuilds in about 35 seconds.

## Structured data

Goes on the **marketing page**, not the app. Google will not read structured
data from a page that is noindexed or behind a login.

`SoftwareApplication` requires three things:

| Property       | Status                                          |
|----------------|-------------------------------------------------|
| `name`         | Fine                                            |
| `offers.price` | Fine — `0` for free                             |
| rating/review  | **Blocker until real reviews exist**            |

Google requires either `aggregateRating` or `review`. Do not invent either. A
fabricated rating is a structured-data policy violation and can draw a manual
action against the whole domain — a bad trade for one rich result.

So: ship the markup now for entity understanding and AI surfaces, add the
rating block once you have genuine reviews, then re-test.

### Markup for the marketing page

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": ["SoftwareApplication", "WebApplication"],
  "name": "FinScope",
  "url": "https://app.nordstromcompany.com",
  "description": "Free household and business finance tracker with double-entry bookkeeping, cash-flow planning and financial statements.",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web browser",
  "browserRequirements": "Requires JavaScript",
  "softwareVersion": "0.1.0",
  "featureList": [
    "Household and business workspaces",
    "Double-entry bookkeeping",
    "Income statement and balance sheet",
    "Cash-flow planning with recurring income and expenses",
    "CSV and bank-export import",
    "Savings goals and budgets"
  ],
  "offers": {
    "@type": "Offer",
    "price": 0,
    "priceCurrency": "USD"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Nordstrom Company",
    "url": "https://nordstromcompany.com"
  }
}
</script>
```

Add once real reviews exist — and only then:

```json
"aggregateRating": {
  "@type": "AggregateRating",
  "ratingValue": 4.7,
  "ratingCount": 23
}
```

### Before you rely on it

- Validate at [search.google.com/test/rich-results](https://search.google.com/test/rich-results)
- The marketing page must describe the tool in visible content. Structured data
  has to match what a user actually sees; markup describing things absent from
  the page is a policy violation in itself.
- Link from the marketing page to `app.nordstromcompany.com` so the association
  is explicit.

## Environment variables

Set in Vercel → Settings → Environment Variables, once Supabase exists:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` must **never** carry the `NEXT_PUBLIC_` prefix. It
bypasses every row-level security policy in the database.
