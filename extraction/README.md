# Local extraction experiment

This proof of concept extracts **unverified candidates** from selectable-text reports using the observed Clinova layout. It does not assign clinical statuses, process scanned reports, connect to Supabase, or save data unless an output path is supplied. Check every field against the original report; rows can be missed or misread.

Requires Python 3 and Poppler's `pdftotext` on the PATH. Run locally:

```sh
python3 extraction/extract.py /path/to/report.pdf --output /private/tmp/report-review.json
```

The JSON contains result names, raw values, units, reference text, and page numbers. Every candidate is marked for review. Numeric rows without the expected columns and qualitative labels outside the small known list may be missed. Only right-column reference continuation lines are collected; layouts can vary. Source-page links are page numbers, not exact bounding boxes. Output contains sensitive health information: keep it private and remove it when no longer needed.

No OCR is implemented yet. A scan or unsupported report returns a nonzero exit status; empty candidate output must not be interpreted as an empty report. The next step is a page-by-page comparison against both original PDFs, a review interface, and then a separately tested Light OCR fallback.
