-- Keep the security-definer helper out of the exposed API schema while
-- preserving policy references and allowing authenticated policy evaluation.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.can_view_member(uuid) set schema private;
