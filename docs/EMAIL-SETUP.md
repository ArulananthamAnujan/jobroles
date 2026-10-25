# Email setup

JobRoles sends three kinds of email, through two routes:

| Email | Sent by | Switched on by |
| --- | --- | --- |
| Account confirmation, password reset, sign-in link | Supabase Auth | Custom SMTP in the Supabase dashboard (step 2) |
| Hiring notifications: new applicant, messages, interview updates, stage changes | `notification-mail` Edge Function | Function secrets (step 3) and a schedule (step 4) |
| Job alerts for job seekers and the employer daily summary | `job-alerts` Edge Function | Function secrets (step 3) and a schedule (step 4) |

Both routes use the same Resend account and the same sending domain. Allow about an hour, most of it waiting for DNS.

You need: the site's domain, access to its DNS, the Supabase project, and the Netlify site.

## 1. Resend: verify the sending domain

1. Create an account at resend.com.
2. **Domains > Add domain.** Use a subdomain such as `mail.yourdomain.com.au`, so email reputation stays separate
   from your main domain's own mailboxes.
3. Add the DNS records Resend shows (SPF as TXT, DKIM as TXT, and the MX record for bounces) at your DNS host.
4. Add a DMARC record if the domain has none: name `_dmarc.yourdomain.com.au`, TXT value
   `v=DMARC1; p=none; rua=mailto:you@yourdomain.com.au`.
5. Wait until Resend shows the domain as **Verified**.
6. **API Keys > Create.** Permission: *Sending access*, limited to this domain. Copy it once; it is the
   `RESEND_API_KEY` below and the SMTP password in step 2.

Sender address: use something people recognise and can reply to, for example
`JobRoles <hello@mail.yourdomain.com.au>`. That exact text is `NOTIFICATION_FROM`.

## 2. Supabase Auth: confirmations and password resets

Supabase's built-in mailer only sends a few emails an hour and only to your own team, so real sign-ups fail without
this step.

1. **Authentication > Emails > SMTP Settings**, turn on *Custom SMTP*:
   - Sender email: `hello@mail.yourdomain.com.au`; sender name: `JobRoles`
   - Host `smtp.resend.com`, port `465`, username `resend`, password: the Resend API key
2. **Authentication > Rate Limits:** raise *emails sent per hour* (for example to 200) now that your own mailer is used.
3. **Authentication > URL Configuration:**
   - Site URL: `https://yourdomain.com.au`
   - Redirect URLs: add `https://yourdomain.com.au/auth/callback`
4. Optional: **Authentication > Emails > Templates** to put your wording on the confirmation and reset emails.

## 3. Function secrets

Generate three long random strings (for example `openssl rand -hex 32`, run three times) for the worker secrets.

```
supabase secrets set \
  RESEND_API_KEY=re_... \
  NOTIFICATION_FROM="JobRoles <hello@mail.yourdomain.com.au>" \
  APP_ORIGIN=https://yourdomain.com.au \
  NOTIFICATION_WORKER_SECRET=<random 1> \
  NOTIFICATION_EMAIL_ENABLED=true \
  JOB_ALERT_WORKER_SECRET=<random 2> \
  JOB_ALERTS_ENABLED=true \
  JOB_FEED_WORKER_SECRET=<random 3>

supabase functions deploy notification-mail job-alerts job-feed-import
```

`APP_ORIGIN` must be the plain https origin with nothing after the domain. Set the same `APP_ORIGIN` in Netlify
(Site configuration > Environment variables) and redeploy the site.

## 4. Schedules

Open [schedules.sql](schedules.sql) in the Supabase **SQL editor**, replace the placeholder values at the top
(project URL, anon key, and the worker secrets from step 3), and run it. It stores those values in Supabase Vault and
schedules:

| Worker | How often |
| --- | --- |
| `notification-mail` | every minute |
| `job-alerts` | every 15 minutes |
| `job-feed-import` | every 30 minutes |

Use the **legacy anon key** (Settings > API Keys > Legacy API keys, starts with `eyJ`). The newer `sb_publishable_`
keys are not accepted by functions that check a token.

Two minutes later, check the calls in the SQL editor:

```sql
select id,status_code,left(content::text,200) from net._http_response order by id desc limit 10;
```

`200` means it works. `401` means a worker secret in Vault does not match the function secret. `503` means a
function secret from step 3 is missing.

## 5. Check delivery for real

Use two inboxes you can open. With Gmail you can use one mailbox for both:
`you+employer@gmail.com` and `you+seeker@gmail.com` arrive in the same inbox but are separate JobRoles accounts.

1. **Sign-up:** create the employer account on the live site. The confirmation email arrives within a minute and
   its link signs you in. Not in the inbox? Check spam, then Resend > Emails for the delivery status.
2. **Password reset:** request one from the sign-in page and set a new password through the link.
3. **Employer:** register a company. In `/admin`, verify it and approve a job you post.
4. **Job seeker:** create the second account, confirm it, and apply to that job.
5. **New applicant email:** the employer inbox gets "New applicant for …" within about a minute.
6. **Message:** the employer opens the applicant and sends a message. The job seeker gets "… sent you a message".
7. **Interview:** the employer offers interview times; the job seeker gets "Interview update for …", picks a time,
   and both join the video room at `/interview/…`.
8. **Job alert:** as the job seeker, search for the job's title, choose *Save search*, then post a second matching job
   as the employer and approve it. The alert arrives on the next job-alerts run.
9. **Opt-outs:** turn off messages in the job seeker's account settings, send another message, and confirm no email
   comes. Use the unsubscribe link in a job alert and confirm it stops.

If every step works, email is ready for launch. In Resend, also check that nothing shows as *bounced* or
*complained*.

## If something fails

- No confirmation email at all: Supabase > Authentication > Logs shows the SMTP error. A wrong SMTP password or an
  unverified domain are the usual causes.
- Confirmation link opens the wrong site or an error page: the Site URL or Redirect URLs in step 2.3.
- Hiring emails missing but sign-up works: run the check in step 4. If the calls return 200 and still nothing
  arrives, look at Resend > Emails, then at the person's notification settings.
- Emails land in spam: wait until DMARC, SPF and DKIM all pass (Resend shows this), and avoid sending from a
  brand-new domain in large volume on day one.
