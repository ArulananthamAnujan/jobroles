# Continue with Google

The button is built and appears on the sign-in and create-account forms of both portals as soon as it is switched on.
Switching it on takes three steps, in this order. Allow about 20 minutes.

You need: your Supabase project reference (the part before `.supabase.co` in the project URL, shown under
**Project Settings > API**) and a Google account that will own the sign-in screen.

## 1. Google Cloud: create the sign-in client

1. Go to console.cloud.google.com and create a project called `JobRoles` (or pick an existing one).
2. **APIs & Services > OAuth consent screen** (also called *Google Auth Platform > Branding*):
   - User type: **External**
   - App name `JobRoles`, user support email and developer contact: your own address
   - Authorised domains: `jobroles.com.au` and `supabase.co`
   - App home page `https://jobroles.com.au`, privacy policy `https://jobroles.com.au/privacy`,
     terms `https://jobroles.com.au/terms`
   - Scopes: leave the defaults (`email`, `profile`, `openid`). These need no Google review.
   - Publish the app (**Publishing status > In production**). While it says *Testing*, only the test users you list
     can sign in.
3. **APIs & Services > Credentials > Create credentials > OAuth client ID**:
   - Application type: **Web application**, name `JobRoles web`
   - Authorised JavaScript origins: `https://jobroles.com.au`
   - Authorised redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
     (this is Supabase's address, not the site's; copy it exactly from the Supabase screen in step 2)
4. Copy the **Client ID** and **Client secret**.

## 2. Supabase: enable Google

1. **Authentication > Sign In / Providers > Google**: turn it on, paste the Client ID and Client secret, save.
   The same screen shows the callback URL to use in step 1.3.
2. **Authentication > URL Configuration**:
   - Site URL: `https://jobroles.com.au`
   - Redirect URLs: make sure `https://jobroles.com.au/auth/callback` is listed.

## 3. The website: show the button

Add this environment variable where the site is hosted, then **rebuild and redeploy** (it is read when the site is
built, so a restart alone is not enough):

```
NEXT_PUBLIC_AUTH_PROVIDERS=google
```

To add Apple or LinkedIn later, enable them in Supabase the same way and list them too:
`NEXT_PUBLIC_AUTH_PROVIDERS=google,apple,linkedin_oidc`.

## Check it works

1. Open `https://jobroles.com.au/job-seeker` in a private window. **Continue with Google** is above the form.
2. Choose a Google account. You should land in the job seeker portal, signed in and greeted by your first name.
3. Do the same from `https://jobroles.com.au/employer`; you should land in the employer portal.

## If something goes wrong

| What you see | Cause |
| --- | --- |
| No button | The variable is missing, or the site was not rebuilt after adding it |
| Google says "redirect_uri_mismatch" | The redirect URI in step 1.3 is not exactly the Supabase callback URL |
| Google says "Access blocked" or only you can sign in | The consent screen is still in *Testing*; publish it |
| "That sign-in option is unavailable" on the site | Google is not enabled in Supabase, or the ID or secret is wrong |
| Back on the site with a "link has expired" message | `https://jobroles.com.au/auth/callback` is not in Supabase's redirect URLs, or Site URL is wrong |

People who already have a password account with the same email are signed in to that same account; Google has
verified the address, so no second account is made.
