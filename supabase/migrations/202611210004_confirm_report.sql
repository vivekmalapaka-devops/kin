-- Server-only transaction: confirm exactly the existing candidate rows together.
create function public.confirm_report_review(p_report uuid, p_date date, p_results jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare existing_count integer; supplied_count integer; updated_count integer;
begin
  if jsonb_typeof(p_results) <> 'array' or p_date is null then
    raise exception 'Invalid review';
  end if;
  perform 1 from public.reports where id = p_report and status = 'needs_review' for update;
  if not found then raise exception 'Report not available for review'; end if;
  select count(*) into existing_count from public.report_results where report_id = p_report;
  select count(*), count(distinct x.id) into supplied_count, updated_count
    from jsonb_to_recordset(p_results) as x(id uuid, name text, raw_value text, unit text, reference_lines jsonb);
  if existing_count = 0 or supplied_count <> existing_count or updated_count <> existing_count then
    raise exception 'Review must include every candidate exactly once';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_results) as x(id uuid, name text, raw_value text, unit text, reference_lines jsonb)
    where x.id is null or nullif(btrim(x.name),'') is null or nullif(btrim(x.raw_value),'') is null
      or jsonb_typeof(x.reference_lines) is distinct from 'array') then
    raise exception 'Invalid candidate';
  end if;
  update public.report_results r set name = x.name, raw_value = x.raw_value, unit = x.unit,
    reference_lines = x.reference_lines, needs_review = false
    from jsonb_to_recordset(p_results) as x(id uuid, name text, raw_value text, unit text, reference_lines jsonb)
    where r.id = x.id and r.report_id = p_report;
  get diagnostics updated_count = row_count;
  if updated_count <> existing_count then raise exception 'Candidate mismatch'; end if;
  update public.reports set collection_date = p_date, status = 'confirmed' where id = p_report;
end;
$$;
revoke all on function public.confirm_report_review(uuid,date,jsonb) from public, anon, authenticated;
grant execute on function public.confirm_report_review(uuid,date,jsonb) to service_role;
