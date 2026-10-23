# Job feed format

Company owners add a feed under **Employer portal → Import jobs (ATS)**. The `job-feed-import`
Edge Function checks every active feed about once an hour.

Every role in a feed must have:

- an ID that stays the same between imports
- a title and a description of at least 40 characters
- a job type (full-time, part-time, casual, contract, temporary or internship)
- at least one location
- a pay range: a minimum, a maximum and a period

Roles without pay are skipped and counted as rejected. New and changed roles go to moderation unless an
administrator has marked the feed as trusted. A role that disappears from the feed is closed.

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

Limits: https only, public hosts only, at most 5 MB and 2,000 roles per feed, at most five feeds per company.
Listings stay live for at most 60 days per import, and every import renews them.

Schedule the worker, for example every 30 minutes, with `POST /functions/v1/job-feed-import` and the
`x-job-feed-secret` header set to `JOB_FEED_WORKER_SECRET`.
