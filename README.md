# JobRoles

Australian job marketplace: Next.js App Router, React and Supabase. This is the standalone Netlify edition of the current JobRoles application.

## Deploy on Netlify

Import `ArulananthamAnujan/jobroles`, branch `main`.
- Base directory: leave blank
- Build: `npm run build`
- Publish directory: `.next`
- Node: 22 (set in netlify.toml)
- Netlify automatically supplies its Next.js adapter. Do not add a static SPA redirect.

Add these environment variables with **Builds and Functions** scopes before deploying:

| Name | Value |
| --- | --- |
| SUPABASE_URL | Your existing Job Platform Supabase project URL |
| SUPABASE_PUBLISHABLE_KEY | The project's publishable key (not service-role key) |
| APP_ORIGIN | Exact HTTPS site origin, without trailing slash, e.g. https://your-site.netlify.app |

Use the existing Job Platform database: no data migration is necessary. Never run `supabase db reset` against it. SQL history is included under `supabase/migrations` for reproducibility; apply only missing migrations after checking remote migration history.

Update Supabase Auth Site URL and allowed redirects for the new origin:
- `/auth/callback`
- `/auth/callback?flow=recovery`
- `/account/reset`

When moving to jobroles.com.au, choose a canonical www or apex origin, update APP_ORIGIN and Auth URLs, and redeploy. Other origins should redirect to that canonical domain. Otherwise same-origin write protection will reject requests.

Supabase Edge Functions remain hosted on Supabase, independently of Netlify. `resume-download` must be deployed for private document downloads; it authenticates callers internally. `notification-mail` requires JWT verification and separate worker-secret authentication; it is not an unauthenticated endpoint. Email setup and scheduling are currently paused. Do not enable sending until credentials, verified sender and delivery testing are completed.

## Launching

See [docs/LAUNCH-CHECKLIST.md](docs/LAUNCH-CHECKLIST.md) for the migrations, Edge Functions, schedules, accounts and settings that switch on alerts, feeds, payments, malware scanning, social sign-in and search indexing.

## Local development

Node 22.13 or newer:
```
npm ci
cp .env.example .env.local
npm run dev
```
Fill in your project settings and use `APP_ORIGIN=http://localhost:3000` locally.

## Checks
```
npm run typecheck
npm test
npm run test:database
npm run build
```
Database tests use an isolated in-memory Postgres instance, not production data.

## Current limits

Deployment is not launch certification. Real-user and mobile browser acceptance tests, malware scanning/quarantine, retention/account deletion, payments, full large-scale account pagination, real verified employer supply and email activation remain outstanding. The `/preview` route is illustrative design data, not the live marketplace.

The original ChatGPT site was private. That access gate does not transfer to Netlify: configure Netlify site protection before allowing pilot access. Application-level Supabase authentication and RLS remain in place. Search-engine indexing stays disabled pending launch review.

No secrets, private user exports, deployment access tokens or production database contents are included.

### Sector guides and AI listing tools

Browse `/market-guide` for 22 researched roles across 12 sectors, salary sources and external vacancy links. In the employer portal, open **Post a job** to use a salary guide, draft or improve a listing with AI, or suggest interview questions. See [activation, data provenance and verification notes](docs/MARKET-GUIDE-AND-AI.md). AI needs runtime provider credentials or an active Netlify AI Gateway; manual posting continues to work without it.
