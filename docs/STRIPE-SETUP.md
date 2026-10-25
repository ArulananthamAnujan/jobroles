# Stripe setup

Posting jobs on JobRoles is free. Stripe only takes payment for two optional extras:

| Product | What the employer gets | Where they buy it |
| --- | --- | --- |
| Sponsored listing | One job shown higher in search, labelled Sponsored, for 30 days, at a fixed price | Performance > Sponsor |
| Advertising credit | Prepaid credit ($50, $100, $250, $500 or $1,000 before GST) spent per click on jobs they choose to promote | Sponsored jobs > Add credit |

Only owners and recruiters of **verified** employers can pay. Every payment produces a Stripe tax invoice with the
employer's ABN. Do everything below in **test mode** first, then repeat steps 2 to 5 in live mode.

## 1. Account

1. Create an account at stripe.com and complete **Activate payments**: business details, ABN, bank account for
   payouts, and the statement descriptor (for example `JOBROLES`).
2. **Settings > Business > Public details:** business name, support email and the website address customers see.

## 2. GST and invoices

- **Settings > Tax:** add your Australian GST registration if you are registered (required once turnover reaches
  $75,000 a year). Turn on **Stripe Tax** if you want GST added to advertising credit automatically; it has a small
  per-transaction fee.
- **Settings > Billing > Invoices:** check your business details and ABN show on invoices. Invoices are emailed to
  the employer after each payment.

If you are not registered for GST, leave Stripe Tax off: credit is then charged at the pack amount with no GST.

## 3. The sponsored listing price

1. **Product catalogue > Add product.** Name: `Sponsored listing, 30 days`.
2. One-off price in **AUD**, for example `$99.00`. If you are registered for GST, set the price to **include tax**
   (Tax behaviour: inclusive), so $99.00 is what the employer pays.
3. Save and copy the price ID (starts with `price_`).

Advertising credit needs no product: the amount is set when the employer picks a pack.

## 4. Webhook

Stripe tells JobRoles when a payment succeeds, and only then is the sponsorship or credit applied.

1. **Developers > Webhooks > Add endpoint**
   - URL: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/billing/webhook`
   - Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
2. Open the endpoint and copy its **Signing secret** (starts with `whsec_`).

## 5. Secrets and deploy

From the project folder, with the Supabase CLI linked to the production project:

```
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_PRICE_SPONSOR=price_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  SPONSOR_DAYS=30 \
  STRIPE_AUTOMATIC_TAX=false \
  AD_CLICK_SECRET=<a long random string> \
  APP_ORIGIN=https://yourdomain.com.au

supabase functions deploy billing --no-verify-jwt
supabase functions deploy ad-click --no-verify-jwt
```

Set `STRIPE_AUTOMATIC_TAX=true` only if Stripe Tax is on (step 2). In **Netlify > Site configuration > Environment
variables**, set the same `AD_CLICK_SECRET` (without it, sponsored clicks are shown but never charged) and redeploy.

## 6. Test with a test card

Use card `4242 4242 4242 4242`, any future expiry, any CVC.

1. Sign in as an owner of a verified company with a live job.
2. **Sponsored jobs > Add credit > $50.** Pay on the Stripe page. You return to JobRoles and the balance shows $50.
3. Start a campaign on the live job (for example $10 a day, $1.50 per click).
4. In a private window, search for the job and click it. Within a minute the employer's *Clicks, 7 days* shows 1 and
   the balance drops by the cost per click. A second click from the same person on the same day is not charged.
5. **Performance > Sponsor** on a job. After paying, the job shows *Sponsored* in search for 30 days.
6. In Stripe, **Developers > Webhooks > your endpoint** shows the deliveries as succeeded, and the employer received
   an invoice email.
7. In `/admin` > **Sponsored clicks**, refund $2 to the company and check its balance rises.

## 7. Go live

1. Switch the Stripe dashboard to **live mode**.
2. Repeat steps 3 and 4 in live mode (the product, price and webhook are separate in live mode).
3. Run step 5 again with the live values: `sk_live_...`, the live `price_...` and the live `whsec_...`. Deploy
   `billing` again.
4. Make one real $50 credit purchase with your own card on your own company, check the invoice, then refund it in
   the Stripe dashboard if you like.

## If something fails

- **"Advertising credit is not available yet":** `STRIPE_SECRET_KEY` or `APP_ORIGIN` is missing from the function secrets.
- **"Only owners and recruiters of verified employers can buy credit":** verify the company in `/admin` first.
- **Paid, but no credit or sponsorship:** Stripe > Webhooks > your endpoint. A 400 error means the signing secret
  does not match, usually a test secret used with live keys or the other way round.
- **Clicks never charged:** `AD_CLICK_SECRET` must be identical in the function secrets and in Netlify, and the site
  redeployed after setting it.
