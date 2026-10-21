# Market guide and employer AI

The `/market-guide` route contains 22 selected occupations in 12 sectors. Each salary card has a SEEK source URL and a research date (21 October 2026). Values are the national `typicalSalary.salary_min` and `salary_max` facts exposed by the linked source page, in AUD/year for full-time advertisements. Do not substitute the wider `suggestion` slider bounds or industry averages. Superannuation inclusion varies. This is a curated snapshot, not a licensed live feed, an exhaustive catalogue, or award/minimum-pay advice. Recheck sources before refreshing `lib/market-guide.ts`; never advance dates without verifying the numbers. No source job descriptions or employer listings have been copied.

External vacancy links open current SEEK searches. They do not create JobRoles jobs or provide market-wide counts. The separate JobRoles live counts remain database-backed. A licensed data partnership would be needed for a broader automatically refreshed jobs feed.

Employers can open a guide role in their portal and explicitly copy its title and salary range. They must confirm actual pay, location, level and superannuation. AI suggestions replace only title and description after confirmation; posting retains the existing moderation workflow.

## AI activation on Netlify

The server route `/api/listing-assistant` uses the official OpenAI SDK. It reads runtime `OPENAI_API_KEY` and optional `OPENAI_BASE_URL` automatically, including Netlify AI Gateway-injected credentials. No credentials are sent to the browser. On an eligible Netlify credit-based plan, enable AI Features and complete a production deploy to activate the gateway. Alternatively supply your own provider key server-side. Do not prefix secrets with NEXT_PUBLIC_. Do not put keys in source control.

Optional `JOB_LISTING_AI_MODEL` overrides the default `gpt-4.1-mini` (verified in Netlify's provider catalogue on the research date). Verify availability when changing models. A missing key produces an honest unavailable message; it does not substitute a template and call it AI. Live inference has not been verified in the user's Netlify deployment.

The supported SDK consumes provider-specific variables by default. Netlify also injects `NETLIFY_AI_GATEWAY_KEY` and `NETLIFY_AI_GATEWAY_URL`; those are intended for third-party clients that need explicit gateway configuration, not this integration.

Apply `20261021035458_listing_ai_quota.sql` before enabling. The endpoint requires a confirmed account, explicit AI-processing consent, same-origin POST and an active owner/recruiter membership of an unsuspended company. Persistent atomic limits allow 10 attempts per user per UTC day, separated by one minute. Failed generation attempts count; unauthorized requests do not. A direct call to the quota RPC can consume only the caller's own allowance and cannot call AI or reset counters. Quota counters retain only one row per account and cascade on account deletion; no prompt/output is stored in the quota table. Provider processing policies still apply.

Inputs are bounded; the SDK has a 35-second timeout and no automatic retries. Outputs are validated and displayed as escaped text. Drafts require human review; interview suggestions never become an application filter. No applicant or resume data is fetched or sent. Employers should include only non-confidential role information. Set hosting-level spend controls as well: per-user limits do not impose a whole-platform budget.

## Verification before offering AI to employers

After deployment, sign in as an owner/recruiter, create a draft, consent and generate suggestions. Confirm applying suggestions preserves salary fields, manual edits remain possible and submission still enters moderation. Test missing credentials, unauthorized membership, rate limit and provider failures. Browser-level and live-provider verification remain pending; local schema, database and build checks cover the implementation only.
