# Making yourself an administrator

There is no built-in admin login and no default password, on purpose: an administrator is an ordinary JobRoles
account that has been added to a private list in the database. Only someone with access to your Supabase project
can add to that list.

## Steps

1. On the live site, create a normal account with the email you want to administer the site with, and confirm it
   from the email you receive. (If you already have an account, use that one.)
2. Open your Supabase project, go to **SQL Editor**, paste the following, replace the email, and press **Run**:

   ```sql
   insert into private.platform_admins(user_id)
   select id from auth.users where lower(email) = lower('you@example.com')
   on conflict (user_id) do update set active = true;

   -- Shows who is an administrator now. Your email should be listed.
   select u.email from private.platform_admins a join auth.users u on u.id = a.user_id where a.active;
   ```

3. Sign out of the site and sign back in, then open `/admin`.

If the second query does not list your email, the account does not exist yet or the email is spelt differently:
check **Authentication > Users** in Supabase.

## Removing an administrator

```sql
update private.platform_admins set active = false
where user_id = (select id from auth.users where lower(email) = lower('them@example.com'));
```

## What still needs an administrator

Companies and jobs are approved automatically (see `docs/ABN-CHECK.md`). A person is only needed for:

- companies whose ABN is missing, cancelled, unknown to the ABN register, registered to a different name, or already
  used by another company (see `docs/ABN-CHECK.md`);
- jobs that the scam checks flag, and jobs from recruitment agencies;
- reviews, reports, support messages, refunds and job sourcing.

These appear in `/admin`.
