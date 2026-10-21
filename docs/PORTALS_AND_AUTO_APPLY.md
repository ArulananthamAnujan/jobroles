# Separate portals and automatic-application preparation

- /job-seeker: profile/resumes, applications, saved jobs/searches, application preferences and privacy.
- /employer: company registration/verification, job posting and management, applicant/team workspace and privacy. Admin capabilities require the existing administrator check. Choosing a portal never grants a role.
- Shared Supabase account; users can switch portals. Existing account URLs redirect compatibly.

Manual is the default. A seeker may save an automatic-mode preference, owned resume version, desired roles/locations, salary range basis, employment types, work arrangement, work rights, experience, availability, excluded companies and daily limit.

This release saves setup preferences only. The database prohibits sending_enabled=true. No worker creates applications from these preferences, no resume is emailed and no payment is charged. Switching back to manual clears automatic settings. Preferences are private under RLS and included in personal data exports.

Before activation: decide price and terms; implement server-verified paid entitlement and explicit versioned sharing consent; implement job matching with exclusions/blocks, eligibility, expiry and daily caps; route unanswered screening questions for user confirmation; submit through the existing atomic unique-application and frozen-snapshot workflow; add cancellation/revocation and audit records; verify concurrency and real-user flows. Any later activation requires a deliberate migration removing the global dispatch prohibition and replacing it with a complete entitlement/consent gate.

Netlify deploys this commit from main. Apply the included application_preferences migration before deploying code to a new database. Existing Job Platform database migration is applied separately during delivery. This does not finish automated applying or payment activation.
