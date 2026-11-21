-- Preserve every extracted candidate and permit additional manual rows.
create or replace function public.confirm_report_review(p_report uuid, p_date date, p_results jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare existing_count integer; matched_count integer; supplied_ids integer; unique_ids integer;
begin
  if jsonb_typeof(p_results) <> 'array' or p_date is null then raise exception 'Invalid review'; end if;
  perform 1 from public.reports where id = p_report and status = 'needs_review' for update;
  if not found then raise exception 'Report not available for review'; end if;
  select count(*) into existing_count from public.report_results where report_id = p_report;
  select count(*) filter (where x.id is not null), count(distinct x.id) into supplied_ids, unique_ids
    from jsonb_to_recordset(p_results) as x(id uuid);
  if existing_count = 0 or supplied_ids <> existing_count or unique_ids <> existing_count then raise exception 'Review must include every candidate exactly once'; end if;
  if exists (select 1 from jsonb_to_recordset(p_results) as x(id uuid, name text, raw_value text, unit text, reference_lines jsonb, source_page integer, result_type text)
    where nullif(btrim(x.name),'') is null or nullif(btrim(x.raw_value),'') is null
      or jsonb_typeof(x.reference_lines) is distinct from 'array'
      or (x.id is null and (x.source_page is null or x.source_page < 1 or x.result_type not in ('numeric','qualitative') or x.result_type is null))) then
    raise exception 'Invalid candidate';
  end if;
  update public.report_results r set name=x.name, raw_value=x.raw_value, unit=x.unit, reference_lines=x.reference_lines, needs_review=false
    from jsonb_to_recordset(p_results) as x(id uuid, name text, raw_value text, unit text, reference_lines jsonb)
    where r.id=x.id and r.report_id=p_report;
  get diagnostics matched_count = row_count;
  if matched_count <> existing_count then raise exception 'Candidate mismatch'; end if;
  insert into public.report_results (report_id,source_page,name,raw_value,unit,reference_lines,result_type,needs_review)
    select p_report,x.source_page,x.name,x.raw_value,x.unit,x.reference_lines,x.result_type,false
    from jsonb_to_recordset(p_results) as x(id uuid, name text, raw_value text, unit text, reference_lines jsonb, source_page integer, result_type text)
    where x.id is null;
  update public.reports set collection_date=p_date, status='confirmed' where id=p_report;
end;
$$;
