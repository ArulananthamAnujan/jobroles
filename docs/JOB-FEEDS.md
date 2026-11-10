# Job feed format

Company owners add a feed under **Employer portal → Import jobs (ATS)**. The `job-feed-import`
Edge Function checks every active feed about once an hour.

Every role in a feed must have:

- an ID that stays the same between imports
- a title and a description of at least 40 characters
- a job type (full-time, part-time, casual, contract, temporary or internship)
- at least one location
- ideally a pay range: a minimum, a maximum and a period

Pay is optional in a feed. A role without a pay range is listed as "Pay not stated by employer"; a role with half a
range is rejected. New and changed roles go to moderation unless an administrator has marked the feed as trusted. A role
that disappears from the feed is closed.

## XML (Indeed format)

```xml
<source>
  <job>
    <referencenumber>RN-204</referencenumber>
    <title><![CDATA[Registered Nurse, Emergency]]></title>
    <description><![CDATA[<p>HTML is allowed.</p>]]></description>
    <city>Frankston</city><state>VIC</state><postalcode>3199</postalcode>
    <jobtype>Full-time</jobtype>
    <remotetype>hybrid</remotetype>
    <salary>$92,000 - $108,000 per year</salary>
    <!-- or structured: <salary_min>92000</salary_min><salary_max>108000</salary_max><salary_period>year</salary_period> -->
    <expiration_date>2026-12-01</expiration_date>
  </job>
</source>
```

## JSON

```json
{"jobs":[{"id":"RN-204","title":"Registered Nurse, Emergency","description":"...","type":"Full-time",
  "arrangement":"hybrid","locations":["Frankston VIC 3199"],
  "salary":{"min":92000,"max":108000,"period":"year"},"expiresAt":"2026-12-01"}]}
```

Limits: https only, public hosts only, at most 5 MB (30 MB for job-board systems) and 2,000 roles per feed, at most
five feeds per company.
Listings stay live for at most 60 days per import, and every import renews them.

Schedule the worker, for example every 30 minutes, with `POST /functions/v1/job-feed-import` and the
`x-job-feed-secret` header set to `JOB_FEED_WORKER_SECRET`.

## Job-board systems

Paste the careers page link and the importer works out the rest:

| System | Careers page link |
| --- | --- |
| Greenhouse | `https://job-boards.greenhouse.io/<board>` |
| Lever | `https://jobs.lever.co/<company>` |
| Ashby | `https://jobs.ashbyhq.com/<board>` |
| SmartRecruiters | `https://jobs.smartrecruiters.com/<Company>` |

These boards list a company's roles worldwide, so only roles in Australia are kept. The same role advertised in several
cities becomes one listing with every location. Pay is taken from the system's pay fields, or from a clear salary range
written in the advert.

## Filling the board before employers join (administrators)

**Admin → Job sourcing** lists an employer's public careers feed without that employer having an account:

1. Paste the employer's name and careers page link, choose **Check the feed first** to see what would come in, then
   **Add employer**.
2. The import worker brings in their Australian roles on its next pass (about hourly), keeps them up to date and closes
   them when the employer does. **Import now** asks for an immediate pass; it runs straight away when
   `JOB_FEED_WORKER_SECRET` is also set as an environment variable on the web host, otherwise at the next scheduled pass.
3. These employers and roles are labelled "From the employer's careers site", never "Verified". People apply on the
   employer's own site, and nobody can apply through JobRoles.
4. When the employer wants to manage their page, they sign up, and you choose **Hand over** with their account email.
   After the usual ABN check choose **Verify ABN**; they then become a normal verified employer.
5. **Remove** closes an employer's imported roles straight away. Use it whenever an employer asks.

Only list feeds an employer publishes for job boards (their public careers board, or a feed they gave you). Do not
copy listings from other job sites: it breaches those sites' terms.
