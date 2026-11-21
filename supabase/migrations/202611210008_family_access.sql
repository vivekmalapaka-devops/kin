-- Keep existing profiles and records while making the two roles explicit.
alter table public.family_members drop constraint if exists family_members_role_check;
update public.family_members set role = 'viewer' where role = 'member';
alter table public.family_members add constraint family_members_role_check check (role in ('admin', 'viewer'));

-- An admin may attach an existing, confirmed account to their own family.
-- No auth account is created and existing family memberships are never moved.
create or replace function public.add_family_user(p_email text, p_name text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.family_members%rowtype; target uuid;
begin
  select * into actor from public.family_members where user_id = (select auth.uid()) and role = 'admin';
  if actor.id is null then raise exception 'Admin access required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor.family_id::text, 0));
  if not exists (select 1 from public.family_members where id = actor.id and role = 'admin') then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_role not in ('admin', 'viewer') or p_name is null or length(trim(p_name)) not between 1 and 100 or p_email is null or length(trim(p_email)) > 254 then
    raise exception 'Invalid family member details' using errcode = '22023';
  end if;
  select id into target from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if target is null then raise exception 'No confirmed account found for this email' using errcode = 'P0001'; end if;
  if exists (select 1 from public.family_members where user_id = target) then raise exception 'Account already belongs to a family' using errcode = 'P0001'; end if;
  insert into public.family_members (family_id, user_id, display_name, role) values (actor.family_id, target, trim(p_name), p_role);
end $$;

create or replace function public.set_family_user_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor public.family_members%rowtype;
begin
  select * into actor from public.family_members where user_id = (select auth.uid()) and role = 'admin';
  if actor.id is null then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_role not in ('admin', 'viewer') then raise exception 'Invalid role' using errcode = '22023'; end if;
  if p_member = actor.id then raise exception 'You cannot change your own role' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor.family_id::text, 0));
  -- Recheck after taking the lock in case another admin changed the actor.
  if not exists (select 1 from public.family_members where id = actor.id and role = 'admin') then raise exception 'Admin access required' using errcode = '42501'; end if;
  update public.family_members set role = p_role where id = p_member and family_id = actor.family_id;
  if not found then raise exception 'Family member not found' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.add_family_user(text,text,text) from public, anon;
revoke all on function public.set_family_user_role(uuid,text) from public, anon;
grant execute on function public.add_family_user(text,text,text) to authenticated;
grant execute on function public.set_family_user_role(uuid,text) to authenticated;
