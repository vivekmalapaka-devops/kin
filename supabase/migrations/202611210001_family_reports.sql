-- Initial private family record model. Provision membership through a trusted
-- administrator; client roles cannot create memberships or change roles.
create extension if not exists pgcrypto;

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'member')),
  unique (family_id, id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null,
  collection_date date,
  lab_name text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'needs_review', 'confirmed', 'failed')),
  storage_path text unique,
  created_at timestamptz not null default now(),
  foreign key (family_id, member_id) references public.family_members(family_id, id)
);

create table public.report_results (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  source_page integer not null check (source_page > 0),
  name text not null,
  raw_value text not null,
  unit text,
  reference_lines jsonb not null default '[]'::jsonb check (jsonb_typeof(reference_lines) = 'array'),
  result_type text not null check (result_type in ('numeric', 'qualitative')),
  needs_review boolean not null default true,
  created_at timestamptz not null default now()
);

create index reports_member_date_idx on public.reports(member_id, collection_date desc);
create index report_results_report_idx on public.report_results(report_id);

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.reports enable row level security;
alter table public.report_results enable row level security;

-- Only privileged code provisions users, writes reports, or changes roles in
-- this first migration. Client reads require both a grant and an RLS policy.
revoke all on public.families, public.family_members, public.reports, public.report_results from anon, authenticated;
grant select on public.families, public.family_members, public.reports, public.report_results to authenticated;

create function public.can_view_member(target_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_members viewer
    join public.family_members target on target.family_id = viewer.family_id
    where viewer.user_id = (select auth.uid()) and target.id = target_member
      and (viewer.role = 'admin' or viewer.id = target.id)
  );
$$;
revoke all on function public.can_view_member(uuid) from public, anon;
grant execute on function public.can_view_member(uuid) to authenticated;

create policy family_select on public.families for select to authenticated
  using (exists (select 1 from public.family_members m where m.family_id = families.id and m.user_id = (select auth.uid())));
create policy members_select on public.family_members for select to authenticated
  using (public.can_view_member(id));
create policy reports_select on public.reports for select to authenticated
  using (public.can_view_member(member_id));
create policy results_select on public.report_results for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id and public.can_view_member(r.member_id)));

-- PDF Storage policies are defined in the next migration.
