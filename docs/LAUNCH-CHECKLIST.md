# Launch checklist

The code for every item below is built and tested. Each one is switched on by an account, key or setting
that only the business owner can create. Work through the steps in order.

## 1. Database

Apply the eleven new migrations to the production Supabase project. Check the remote history first and never
run `supabase db reset` against production.

```
supabase migration list --linked
supabase db push --linked
```

| Migration | What it adds |
| --- | --- |
| `20261023000001_security_hardening` | Hides expected screening answers, resume scan status, withdrawn applications end resume access |
| `20261023000002_ranked_search` | Full-text search, Australian place gazetteer, distance and date filters |
| `20261023000003_job_alerts` | Saved-search email alerts and unsubscribe tokens |
| `20261023000004_account_erasure` | Completing deletion requests |
| `20261023000005_job_feeds` | ATS and careers-site feed imports |
| `20261023000006_recommendations_and_stats` | Jobs for you, listing views and the hiring funnel |
| `20261023000007_monetisation_and_trust` | Sponsored listings, candidate search, invitations, risk flags, responsiveness |
| `20261024000001_australian_postcodes` | Every Australian locality and postcode for distance search (about 830 KB) |
| `20261024000002_company_reviews` | Moderated hiring-experience reviews from applicants |
| `20261024000003_push_notifications` | Phone and browser push subscriptions for job alerts |
| `20261024000004_ats_formats` | Greenhouse and Lever feed formats |

## 2. Edge Functions

```
supabase functions deploy resume-scan job-alerts job-feed-import
supabase functions deploy account-erasure
supabase functions deploy billing --no-verify-jwt   # Stripe cannot send a Supabase token; the function checks its own
```

Set their secrets with `supabase secrets set NAME=value`:

| Feature | Secrets |
| --- | --- |
| Resume malware scanning | `RESUME_SCAN_WORKER_SECRET`, `RESUME_SCANNER_URL`, `RESUME_SCANNER_TOKEN`, then `RESUME_SCAN_REQUIRED=true` once scanning works |
| Job alerts | `JOB_ALERT_WORKER_SECRET`, `JOB_ALERTS_ENABLED=true`, `RESEND_API_KEY`, `NOTIFICATION_FROM`, `APP_ORIGIN` |
| Feed imports | `JOB_FEED_WORKER_SECRET` |
| Sponsored listings | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_SPONSOR`, `STRIPE_WEBHOOK_SECRET`, `SPONSOR_DAYS` (default 30) |
| Push notifications (job-alerts function) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:you@yourdomain` |

`RESUME_SCANNER_URL` must point to a service that accepts a file in a POST and answers `{"clean": true|false}`.
A small ClamAV container on Cloud Run or Fly.io is enough.

## 3. Schedules

Call the workers on a schedule, using `pg_cron` with `pg_net`, a GitHub Actions cron or any uptime service. Each
call is a POST with its secret header:

| Worker | Header | Suggested interval |
| --- | --- | --- |
| `resume-scan` | `x-resume-scan-secret` | every 5 minutes |
| `job-alerts` | `x-job-alert-secret` | every 30 minutes |
| `job-feed-import` | `x-job-feed-secret` | every 30 minutes |

## 4. Accounts to create

- **Resend**: verify the sending domain (SPF, DKIM, DMARC) and send yourself a test alert before turning alerts on.
- **Stripe**: create a product such as "Sponsored listing, 30 days" with a one-time **AUD price that includes GST**,
  and turn on tax invoices. Add a webhook to `https://<project>.supabase.co/functions/v1/billing/webhook` for
  `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
- **Cloudflare Turnstile**: create a widget for the site domain. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and
  `TURNSTILE_SECRET_KEY` in Netlify.
- **Google, Apple and LinkedIn sign-in**: enable each provider in Supabase Auth, add `/auth/callback` to the
  allowed redirect URLs, then list them in Netlify as `NEXT_PUBLIC_AUTH_PROVIDERS=google,apple,linkedin_oidc`.
- **OpenAI**: `OPENAI_API_KEY` in Netlify switches on the listing assistant and resume autofill.
- **Push notifications**: run `npx web-push generate-vapid-keys` once. Put the public key in Netlify as
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and both keys in the job-alerts function secrets (above).
- **Sentry** (optional): create a project and set `SENTRY_DSN` in Netlify. Without it, errors still go to the
  Netlify function log.
- **Store apps**: follow [MOBILE-APPS.md](MOBILE-APPS.md) for Google Play and the App Store.

## 5. Netlify settings

Set these with **Builds and Functions** scope, then redeploy:

- `APP_ORIGIN`: the canonical https origin. Production refuses to send auth emails without it.
- `SITE_INDEXING=true`: set only when you are ready for Google, because it opens robots.txt and the sitemap.
  Then submit `https://<domain>/sitemap.xml` in Google Search Console.
- Add an uptime monitor on `https://<domain>/api/health`.

## 6. Before the public launch

- Have an Australian lawyer review `/terms` and `/privacy`.
- Test on real phones (iOS Safari, Android Chrome), including installing the app from the browser menu.
- Load a full Australian postcode gazetteer into `public.au_places` for suburb-level distance search. About 90
  capital and regional centres are seeded.
- Recruit verified employers in one city and one or two sectors first. A board with few jobs loses seekers.

## Data credits

Locality and postcode coordinates come from Matthew Proctor's Australian Postcodes dataset
(https://www.matthewproctor.com/australian_postcodes). Confirm its current licence terms before launch and credit it
on the privacy or terms page if it requires attribution.
