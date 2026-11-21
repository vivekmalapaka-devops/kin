-- Invitations are claimed only by the verified account for the addressed email.
create table private.family_invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('admin', 'viewer')),
  expires_at timestamptz not null default now() + interval '7 days'
);
revoke all on private.family_invitations from public, anon, authenticated;

create function public.prepare_family_invitation(p_email text, p_name text, p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor public.family_members%rowtype; invitation_id uuid; normalized text := lower(trim(p_email));
begin
  select * into actor from public.family_members where user_id = (select auth.uid()) and role = 'admin';
  if actor.id is null then raise exception 'Admin access required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor.family_id::text, 0));
  if not exists (select 1 from public.family_members where id = actor.id and role = 'admin') then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('admin','viewer') or p_name is null or length(trim(p_name)) not between 1 and 100 or normalized is null or length(normalized) not between 3 and 254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid invitation details' using errcode = '22023'; end if;
  if exists (select 1 from auth.users where lower(email) = normalized and email_confirmed_at is not null) then raise exception 'This account already exists; add it as an existing account' using errcode = 'P0001'; end if;
  delete from private.family_invitations where email = normalized and expires_at <= now();
  if exists (select 1 from private.family_invitations where email = normalized) then raise exception 'This email already has a pending invitation' using errcode = 'P0001'; end if;
  insert into private.family_invitations (family_id,email,display_name,role) values (actor.family_id,normalized,trim(p_name),p_role) returning id into invitation_id;
  return invitation_id;
end $$;

create function public.cancel_family_invitation(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.family_invitations i using public.family_members m where i.id = p_id and m.family_id = i.family_id and m.user_id = (select auth.uid()) and m.role = 'admin';
end $$;

create function public.list_family_invitations()
returns table (id uuid, email text, display_name text, role text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.email, i.display_name, i.role, i.expires_at from private.family_invitations i
  join public.family_members m on m.family_id = i.family_id
  where m.user_id = (select auth.uid()) and m.role = 'admin' and i.expires_at > now()
  order by i.expires_at;
$$;

create function public.accept_family_invitation()
returns void language plpgsql security definer set search_path = '' as $$
declare current_email text; invite private.family_invitations%rowtype;
begin
  select lower(email) into current_email from auth.users where id = (select auth.uid()) and email_confirmed_at is not null;
  if current_email is null then raise exception 'Verified account required' using errcode = '42501'; end if;
  select * into invite from private.family_invitations where email = current_email and expires_at > now() for update;
  if invite.id is null then
    if exists (select 1 from public.family_members where user_id = (select auth.uid())) then return; end if;
    raise exception 'Invitation expired or unavailable' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.family_members where user_id = (select auth.uid())) then raise exception 'Account already belongs to a family' using errcode = 'P0001'; end if;
  insert into public.family_members(family_id,user_id,display_name,role) values(invite.family_id,(select auth.uid()),invite.display_name,invite.role);
  delete from private.family_invitations where id = invite.id;
end $$;
revoke all on function public.prepare_family_invitation(text,text,text), public.cancel_family_invitation(uuid), public.list_family_invitations(), public.accept_family_invitation() from public, anon;
grant execute on function public.prepare_family_invitation(text,text,text), public.cancel_family_invitation(uuid), public.list_family_invitations(), public.accept_family_invitation() to authenticated;
