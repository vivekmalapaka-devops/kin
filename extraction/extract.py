#!/usr/bin/env python3
"""Extract review candidates from selectable-text Clinova reports, locally."""

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


NUMERIC = re.compile(r"^\s{1,8}(.+?)\s{8,}([<>]?[\d]+(?:\.[\d]+)?)\s{2,}(\S+)\s{2,}(.+?)\s*$")
QUALITATIVE = re.compile(r"^\s{1,8}(.+?)\s{8,}(\S.*?)\s*$")
TEXT_RESULTS = {"RBC Morphology", "WBC Morphology", "Platelet Morphology", "Impression", "Advise"}
INTERVAL = re.compile(r"^\s*\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*$")


def parse_document(text):
    results = []
    pages = text.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    for page_number, page in enumerate(pages, 1):
        inside_table = False
        current = None
        for line in page.splitlines():
            if "Test Description" in line and "Result" in line:
                inside_table = True
                current = None
                continue
            if not inside_table:
                continue
            if any(marker in line for marker in ("--End of Report--", "electronically authenticated report", "Manager Lab Operations", "Manager Technical")):
                inside_table = False
                continue
            match = NUMERIC.match(line)
            if match:
                name, value, unit, reference = match.groups()
                current = {"page": page_number, "name": name.strip(), "value": value, "unit": unit, "reference_lines": [reference.strip()], "type": "numeric", "needs_review": True}
                results.append(current)
                continue
            match = QUALITATIVE.match(line)
            if match and match.group(1).strip() in TEXT_RESULTS:
                name, value = match.groups()
                results.append({"page": page_number, "name": name.strip(), "value": value.strip(), "unit": None, "reference_lines": [], "type": "qualitative", "needs_review": True})
                current = None
                continue
            # Reference categories are printed in the far-right column. Keep
            # their wording intact, including operators and unusual labels.
            if current and line.strip() and len(line) > 150 and not line[:150].strip():
                current["reference_lines"].append(line.strip())
        
    for result in results:
        refs = result["reference_lines"]
        result["reference_kind"] = "simple_interval" if len(refs) == 1 and INTERVAL.fullmatch(refs[0]) else "complex_or_missing"
    return {"pages": len(pages), "results": results, "notice": "Unverified extraction candidates; compare every field with the original PDF. No clinical status is assigned."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path, help="Local PDF to inspect")
    parser.add_argument("--output", type=Path, help="Write private JSON output here; otherwise print to stdout")
    args = parser.parse_args()
    if not shutil.which("pdftotext"):
        parser.error("pdftotext is required (Poppler)")
    if not args.pdf.is_file():
        parser.error("PDF file does not exist")
    try:
        completed = subprocess.run(["pdftotext", "-layout", str(args.pdf), "-"], check=True, capture_output=True, text=True, timeout=60)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        print(f"PDF text extraction failed: {exc}", file=sys.stderr)
        return 1
    data = parse_document(completed.stdout)
    if not data["results"]:
        print("No results found. This may be a scanned or unsupported report; OCR is not implemented.", file=sys.stderr)
        return 2
    output = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        # Owner-only permissions for newly created output files.
        import os
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            file.write(output)
    else:
        print(output, end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
