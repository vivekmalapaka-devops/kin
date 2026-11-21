-- Private PDFs are accessible only when an existing report links the exact
-- object path to a member the current user may view. Uploads and deletion are
-- intentionally reserved for trusted server-side code until implemented.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blood-reports', 'blood-reports', false, 20971520, array['application/pdf']);

create policy "family members can read permitted report PDFs"
on storage.objects for select to authenticated
using (
  bucket_id = 'blood-reports'
  and exists (
    select 1 from public.reports r
    where r.storage_path = storage.objects.name
      and public.can_view_member(r.member_id)
  )
);
