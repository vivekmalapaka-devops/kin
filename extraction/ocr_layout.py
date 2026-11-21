"""Reconstruct the observed lab's columns from Light OCR page coordinates."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLI = ROOT / "node_modules" / ".bin" / "light-ocr"


def reconstruct(document):
    pages = []
    for page in document["pages"]:
        width = page["width"]
        lines = []
        for item in page["lines"]:
            points = item.get("box", [])
            if not points:
                continue
            left = min(point["x"] for point in points)
            top = min(point["y"] for point in points)
            bottom = max(point["y"] for point in points)
            lines.append((top + (bottom - top) / 2, left, item["text"]))
        lines.sort()
        grouped = []
        for y, x, text in lines:
            if not grouped or abs(y - grouped[-1][0]) > max(8, width * .008):
                grouped.append([y, [(x, text)]])
            else:
                grouped[-1][1].append((x, text))
        output = []
        for _, chunks in grouped:
            columns = [[], [], [], []]
            for x, text in sorted(chunks):
                ratio = x / width
                index = 0 if ratio < .45 else 1 if ratio < .59 else 2 if ratio < .68 else 3
                columns[index].append(text)
            values = [" ".join(column) for column in columns]
            # Match the parser's four layout columns while preserving text.
            output.append("    " + values[0].ljust(124) + values[1].ljust(16) + values[2].ljust(12) + values[3])
        pages.append("\n".join(output))
    return "\f".join(pages)


def recognize(pdf):
    if not CLI.is_file():
        raise RuntimeError("Light OCR is not installed; run npm install")
    try:
        result = subprocess.run([str(CLI), str(pdf), "--format", "json", "--dpi", "200"], capture_output=True, text=True, check=True, timeout=300)
        return reconstruct(json.loads(result.stdout))
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError, KeyError) as exc:
        raise RuntimeError("OCR could not process this report") from exc
