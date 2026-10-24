-- Fixes found running the full app on a real Supabase stack.
begin;
-- Saving a search creates a daily job alert, as on other job sites; people can switch it off in their account.
-- Starting the clock now means the first email only lists jobs posted after the search was saved.
create function private.saved_search_defaults() returns trigger language plpgsql set search_path='' as $$
begin
 if new.frequency='off' then new.frequency:='daily';end if;
 new.last_alerted_at:=coalesce(new.last_alerted_at,now());
 return new;
end $$;
create trigger saved_search_defaults before insert on public.saved_searches for each row execute function private.saved_search_defaults();
commit;
