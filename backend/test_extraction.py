import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "extraction"))
from extract import parse_document
from ocr_layout import reconstruct
from process_report import process


class ExtractionTests(unittest.TestCase):
    def test_blank_pages_are_counted_and_not_silently_dropped(self):
        parsed = parse_document("unrecognized page\f\f")
        self.assertEqual(parsed["pages"], 2)

    def test_ocr_columns_create_a_review_candidate(self):
        def line(text, x, y):
            return {"text": text, "box": [{"x": x, "y": y}, {"x": x + 20, "y": y + 10}]}
        document = {"pages": [{"width": 1000, "lines": [line("Test Description", 50, 100), line("Result", 510, 100), line("Units", 610, 100), line("Reference Ranges", 700, 100), line("Example", 50, 150), line("5.2", 510, 150), line("mg/dL", 610, 150), line("4-6", 700, 150)]}]}
        parsed = parse_document(reconstruct(document))
        self.assertEqual(len(parsed["results"]), 1)
        self.assertEqual(parsed["results"][0]["value"], "5.2")
        self.assertTrue(parsed["results"][0]["needs_review"])

    def test_unrecognized_page_triggers_ocr_and_stays_in_review(self):
        ocr_text = "Test Description   Result\n    Example" + " " * 50 + "5.2    mg/dL    4-6\n\f"
        with patch("process_report.subprocess.run") as direct, patch("process_report.recognize", return_value=ocr_text) as ocr:
            direct.return_value.stdout = "\f"
            result = process(Path("placeholder.pdf"))
        self.assertEqual(result["status"], "needs_review")
        self.assertEqual(result["method"], "ocr")
        self.assertEqual(result["pages_without_candidates"], [])
        ocr.assert_called_once()


if __name__ == "__main__":
    unittest.main()
