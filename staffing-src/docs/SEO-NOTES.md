# SEO notes

This is a direct-response page for outbound email traffic, not primarily a search page. The production pass applies basic SEO hygiene without extending the copy for search engines.

## In place (2026-09-14)

- Title: "Employer Acquisition for Industrial Staffing Agencies | ScaleLab AI".
- Meta description (about 160 characters) built from the core positioning and the performance line.
- `robots: index, follow, max-image-preview:large`; canonical `https://scalelabai.ca/staffing/`. The earlier preview used `noindex, nofollow`; indexing is now allowed because the page is a finished, accurate service page. Reverse by restoring `noindex` if the page should stay outbound-only.
- Listed in the main site's `sitemap.xml` (one `<url>` entry, `lastmod` 2026-09-14). `robots.txt` already allows all crawlers and points to that sitemap.
- Open Graph and Twitter card: title, description, URL, site name, 1200×630 image (`og-image.jpg`, a frame from the explainer) with alt text.
- FAQPage JSON-LD matching the visible FAQ word for word.
- One H1, H2 per section, H3 inside cards and FAQ questions; no skipped levels (checked by `tools/check.mjs`).
- All copy is in the initial HTML; nothing important depends on JavaScript.
- URL variants on the live host resolve to the canonical: `/staffing` → 301 `/staffing/`, `http://` → 301 `https://`, `www.` → 301 apex; query strings (UTM tags) return 200 with the same canonical.

## Not done

- No internal links from the main site to `/staffing/` — that changes the wider site and was out of scope.
- A full keyword pass still needs primary and secondary keywords, the geographic focus for this offer, and any competitor URLs.
