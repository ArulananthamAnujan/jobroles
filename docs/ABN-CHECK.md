# How employers' ABNs are checked

## What happens when a company registers

1. **At the form.** The ABN must be 11 digits that pass the ABN's built-in check digits. This only catches typing
   mistakes: it does not prove the business exists.
2. **About a minute later, in the database.** The site asks the Australian Business Register (ABR), the government's
   own record, about the ABN. The company is verified automatically only when all three are true:
   - the register says the ABN is **Active**;
   - the name on the register (the legal name or any registered business name) **matches the company name** the
     employer typed. Words like "Pty Ltd", "The" and "Australia" are ignored, so "Kumar Building Supplies" matches
     "KUMAR BUILDING SUPPLIES PTY LTD";
   - **no other company** on JobRoles uses the same ABN.
3. **Otherwise it waits for you.** A cancelled ABN, an ABN the register has never heard of, an ABN that belongs to
   a differently named business, or an ABN already in use here is not verified. The employer sees the reason on
   their overview, and the company appears in `/admin` for you to verify or leave.

Every automatic decision is written to the audit log with what the register said.

## Connecting the register (one-off, free)

The register needs an access key, which it calls a GUID.

1. Go to `abr.business.gov.au/Tools/WebServices` and register for ABN Lookup web services. It is free. The key is
   emailed to you, usually within a few days.
2. Sign in to JobRoles as an administrator and open **Admin > Setup status**.
3. Under **Connect the ABN register**, paste the key and choose **Save key**.
4. Press **Check again**. "ABN register" under *Employer checks* should say **Working**.

If it says the database cannot make web requests, open Supabase > **Database > Extensions** and switch on `http`.

## Until the register is connected

The site falls back to step 1 only (well-formed ABN that nobody else here uses), so employers are not stuck while
you wait for the key. In that state anyone who knows a real ABN can register under it, so connect the register
before promoting the site to employers. Setup status shows this as **Needs attention**.

## What this does not do

- It does not prove the person registering works for that business. For that, an administrator can still verify a
  company by hand (email domain, phone call, or a document).
- A sole trader's ABN is registered to their personal name. If they register a trading name that is not on the
  register, the names will not match and the company waits for you.
