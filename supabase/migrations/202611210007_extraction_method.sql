alter table public.reports add column extraction_method text
  check (extraction_method in ('pdf_text', 'ocr', 'pdf_text_and_ocr'));
