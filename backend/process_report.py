#!/usr/bin/env python3
"""Local worker entry point for the report extraction proof of concept."""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "extraction"))
from extract import parse_document  # noqa: E402
from ocr_layout import recognize  # noqa: E402


def process(pdf):
    try:
        proc = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True, timeout=60)
    except FileNotFoundError as exc:
        raise RuntimeError("pdftotext is not installed") from exc
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("PDF text extraction failed") from exc
    parsed = parse_document(proc.stdout)
    covered = {result["page"] for result in parsed["results"]}
    missing = [page for page in range(1, parsed["pages"] + 1) if page not in covered]
    method = "pdf_text"
    if missing or not parsed["results"]:
        try:
            ocr = parse_document(recognize(pdf))
        except RuntimeError as exc:
            return {"status": "failed", "reason": "ocr_failed", "message": str(exc)}
        if parsed["pages"] != ocr["pages"]:
            return {"status": "failed", "reason": "page_count_mismatch", "message": "OCR could not verify the PDF page count."}
        for result in ocr["results"]:
            if result["page"] in missing:
                parsed["results"].append(result)
        method = "pdf_text_and_ocr" if covered else "ocr"
        parsed["results"].sort(key=lambda result: result["page"])
        covered = {result["page"] for result in parsed["results"]}
        missing = [page for page in range(1, parsed["pages"] + 1) if page not in covered]
    if not parsed["results"]:
        return {"status": "failed", "reason": "no_supported_results", "message": "No supported results found; the report requires manual processing."}
    return {"status": "needs_review", "method": method, "pages_without_candidates": missing, **parsed}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    args = parser.parse_args()
    if not args.pdf.is_file():
        parser.error("PDF file does not exist")
    try:
        result = process(args.pdf)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "needs_review" else 2


if __name__ == "__main__":
    sys.exit(main())
