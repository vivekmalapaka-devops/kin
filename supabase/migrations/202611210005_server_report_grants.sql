-- The trusted server creates, reads, updates and removes reports and their
-- candidate results after authorizing the caller. RLS remains in place for
-- authenticated clients; this role uses the server-only Supabase secret key.
grant select, insert, update, delete on public.reports, public.report_results to service_role;
