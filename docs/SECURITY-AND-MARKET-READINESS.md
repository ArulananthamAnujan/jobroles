# Security review and Indeed readiness

Reviewed 23 October 2026 against commit `6612a33` plus the fixes in this branch.

## 1. Security review

### Fixed in this branch

| Severity | Issue | Fix |
| --- | --- | --- |
| Critical | `next@16.3.4` has published advisories, including two unauthenticated remote code execution bugs (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr), SSRF in image optimisation and cache poisoning. | Upgraded `next` and `eslint-config-next` to `16.4.2`. `npm audit --omit=dev` now reports 0 vulnerabilities. |
| Medium | No browser security headers on pages, so the site could be framed (clickjacking) and had no HSTS. | `next.config.ts` now sends `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS, `nosniff`, `Referrer-Policy: no-referrer` and a restrictive `Permissions-Policy`, and drops `X-Powered-By`. |
| Medium | `/api/applications/[id]` returned each screening question's `expected_answer` and `must_have` to the job seeker, so a seeker could see the answer an employer screens for. | The route now selects only `id,question` for seekers. The hiring team still gets the full fields. |

### Still open: fix before launch

1. **Expected screening answers are readable straight from the database.** `screening_questions` grants `SELECT` on every column to `anon` and `authenticated`, and its policy allows reading any question on a live job. Anyone holding the Supabase URL and publishable key (they are not secret by design) can query `expected_answer` through PostgREST. Move `must_have` and `expected_answer` into a table only the job's team can read, or revoke those two columns and expose them through a security-definer function that checks `private.can_read_job`. This needs a migration on the production database, so it isn't in this branch.
2. **No malware scanning of resumes.** Uploads are checked for size and file signature only, and the README already lists scanning as outstanding. Scan files before employers can download them, for example with a storage-trigger function running ClamAV or a commercial scanning API, and quarantine anything that fails.
3. **Abuse controls.** Sign-up, sign-in and password reset rely only on Supabase Auth's default rate limits. The public `/api/jobs` search has no throttling. Turn on CAPTCHA in Supabase Auth (Cloudflare Turnstile or hCaptcha) and add per-IP rate limits at the edge (Netlify rate-limiting rules).
4. **`APP_ORIGIN` must always be set.** If it is missing, `sameOrigin()` falls back to the request's own origin, and password-reset and confirmation links are built as `undefined/auth/callback`. Make the server refuse to start without it.
5. **Resume access after withdrawal.** `private.resume_access` lets the hiring team download a resume for any non-draft application, including withdrawn ones. Decide whether withdrawal should revoke access, and state the answer in the privacy policy.
6. **Content Security Policy for scripts.** The new CSP covers framing, plugins and form targets but not `script-src`. Add a nonce-based `script-src` once the pages are server-rendered (see section 2).
7. **Operational gaps already listed in the README:** account deletion and data retention, real-device browser testing, and enabling email only after the sender is verified.

### What is already done well

- Row-level security is enabled on every table. Clients have no direct write grants: every change goes through `security definer` RPCs that check membership, role and state.
- Every state-changing endpoint checks the request's origin, limits body size (64 KB for JSON, 11 MB for uploads) and validates input with zod.
- Resumes sit in a private bucket. The service-role key is used only inside the download function, and only after the caller's own RLS check passes. Downloads are served as attachments with a sandbox CSP.
- Session cookies are `httpOnly`, `SameSite=Lax` and `Secure` in production. Invitation tokens are stored only as SHA-256 hashes.
- Opening an email confirmation link with GET does not consume the one-time token, so email security scanners can't sign people in by prefetching it.
- No secrets, keys or production data are committed.

## 2. Is JobRoles ready to compete with Indeed?

**Not yet.** The product side is solid for a pilot. Search, applying with chosen resume versions, screening questions, saved jobs, application tracking, messaging, interview scheduling, an employer pipeline, team roles, ABN-verified employers, moderation, privacy export and an AI listing assistant all exist. Indeed's advantage, though, comes from four things JobRoles lacks: **job volume, Google traffic, alerts that bring people back, and a business model.** No startup beats Indeed head-on. The realistic aim is to win a niche Indeed serves badly: **Australian jobs where the pay is always shown and the employer is verified.** The plan below is built around that position.

### Phase 1: launch blockers (needed for any public launch)

| What | Why | Where things stand |
| --- | --- | --- |
| Server-rendered job pages, a sitemap, `JobPosting` structured data, and indexing turned on | Google for Jobs is a major source of job-seeker traffic, and it needs crawlable pages carrying schema.org `JobPosting`. The job pages are currently rendered in the browser, and `robots` is set to `noindex`. | Not started |
| Email: job alerts, application updates and a verified sender | Saved searches are always stored with `frequency: 'off'`, and notification email is paused. Alerts are what bring seekers back. | Queue built, sending disabled |
| The security items in section 1 | Trust is the whole pitch. | Partly done |
| Account deletion and retention, Terms of Service, and a privacy policy that meets the Australian Privacy Principles | Required under the Privacy Act 1988. The Spam Act 2003 applies to alert emails. | Partly done (privacy requests exist) |
| Error monitoring, uptime checks and verified backups | You can't run a marketplace blind. | Not started |

### Phase 2: supply and retention (what makes it worth visiting)

| What | Why |
| --- | --- |
| **Job supply**: XML/JSON feed import and ATS integrations (JobAdder, PageUp, Workday, Greenhouse, Lever), each still needing a verified employer and a stated pay range | Indeed has millions of listings and JobRoles has only what employers post by hand. An empty board loses both sides. |
| **Better search**: full-text search over title, description and company (Postgres `tsvector`, or Typesense or Meilisearch), relevance ranking, synonyms (RN = registered nurse), typo tolerance, distance search (`job_locations` already has unused `latitude` and `longitude` columns), a "posted within" filter, and sector browsing | Search today is a substring match on the title only. |
| **Sign-in options**: Google, Apple and LinkedIn sign-in, and magic links | Password-only sign-up loses many mobile users. |
| **Quick apply**: resume parsing that fills in the profile, and one-tap apply using a saved profile and resume | Indeed's apply flow is a few taps. |
| **Recommendations**: "Jobs for you" based on skills, location and salary floor | This drives repeat visits. |
| **Mobile**: a PWA with push notifications first, native apps later | Most job searching happens on phones. |
| **Employer analytics**: views, apply rate and time to hire for each listing | Employers stay where they can see results. |

### Phase 3: business and moat

| What | Why |
| --- | --- |
| Payments (Stripe, with GST invoicing) for sponsored listings, pay-per-application or posting packs | There is no revenue model yet. |
| Candidate search for employers, using profiles where seekers opted in (the `seeker_profiles.searchable` consent field already exists) | A second product to sell, priced like Indeed Resume. |
| Company pages with verified pay data, employee reviews and interview Q&A | This is how Indeed holds employer-research traffic. Build it from your own verified pay data rather than copying reviews. |
| Expanding the salary guides from 22 roles to every major occupation, using live listing data | Salary pages rank well and support the pay-transparency position. |
| Calendar integration (Google and Outlook) for interviews, plus video links | Employers expect it. |
| Trust and safety at scale: scam-listing detection, employer reputation and response-time badges | Keeps the verified promise as volume grows. |

### Where JobRoles can win

- **Pay is mandatory and verified.** Indeed does not require it. Make "every listing shows its pay" a hard rule, which the new homepage now says, and publish the share of listings with pay as a public stat once there is real volume.
- **Privacy by default.** The resume is shared only on submit, applications can be withdrawn, and data can be exported. Seekers worried about spam recruiters will value this.
- **ABN-verified employers only.** No ghost jobs or scams. Track it and say so.

## 3. Homepage redesign (this branch)

The homepage at `/` is now `components/home-page.tsx`. It was built with the `design-taste-frontend` skill, direction "The page is the object" (seed 1520748693), keeping the brand's colours and DM Sans and Manrope.

- **Idea:** the hero is a stack of file folders. Each tab opens a section of the page, and the front folder holds the job search, so search is on the first screen instead of below the fold.
- **Interactive element:** a pay slider ("At least $90,000 a year") that queries live listings and shows how many roles clear it, grouped by state.
- **Sections:** live roles by state with pay ranges, the application process printed as a slip, an employer section with an example listing, a "Show me work in ___" city search, and a tiled footer.
- **Checks:** the skill's inspector shows 0 FAIL at 1440, 768 and 390 px. It leaves three warnings. There are no photographs or video, because this environment blocked the open image archives, so the page uses interface pieces instead; add real photos of Australian workplaces later. The other warning is a small left/right margin difference.
- `/search` and `/jobs/[id]` are unchanged.
