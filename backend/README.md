# Backend foundation

This is a local processing entry point and an **unapplied** Supabase migration, not a deployed API. The worker extracts candidates from selectable-text Clinova reports and returns `needs_review`; it never assigns clinical statuses. It requires Python 3 and Poppler's `pdftotext`.

```sh
python3 backend/process_report.py /path/to/report.pdf > /private/tmp/report-review.json
```

The output contains private health data. Shell redirection follows your shell's file permissions; use a private location and delete it when finished. The parser is format-specific, can miss fields, and every candidate needs review. Unsupported and scanned PDFs return a failed state; a Light OCR fallback and page completeness checks remain to be implemented.

The SQL migrations define families, members, reports and candidates, with read policies scoped to each member or the family admin. A private `blood-reports` bucket permits reads only when the object path is linked to a report the user can view. Client writes to records and objects are deliberately disabled. The migrations have been applied to the connected project; Supabase's security advisor reports no findings. A rollback-only synthetic database test checked report and object visibility for an admin, a member and an outsider. Membership provisioning, review updates, full authorization coverage and asynchronous job processing are not implemented. Do not upload real data until the access policies and ingestion flows have been tested end to end.

`server.py` serves an experimental local-only application and upload endpoint. It validates a user access token, checks target-profile visibility using the user-scoped Supabase API, processes a PDF, and then writes the PDF and review candidates with a server-only secret. It requires `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` in the process environment or the ignored root `.env` file. Start with `python3 backend/server.py`; it binds to `127.0.0.1:8787`. POST raw PDF bytes to `/reports` with `Authorization: Bearer <user access token>`, `X-Member-Id: <member UUID>`, and `Content-Type: application/pdf`. The secret must never be put in browser code.

This application is not production-ready or end-to-end tested against Supabase. Light OCR is used when a page has no directly extracted candidates; it has only been evaluated against these two lab layouts and may read units or ranges incorrectly. It does not detect every omitted row on a partially extracted page. Manual additions during review are supported. Full page-level extraction verification, durable cleanup/retry, and deployment protections are still needed. Sessions are kept in the browser tab's session storage, refreshed when needed, and removed on sign-out.
