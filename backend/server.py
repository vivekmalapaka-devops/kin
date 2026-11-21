#!/usr/bin/env python3
"""Local API for authenticated report ingestion. Requires a trusted backend host."""
import json
import os
import ssl
import subprocess
import tempfile
import uuid
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlencode, urlparse

from process_report import process

env_file = Path(__file__).resolve().parent.parent / ".env"
if env_file.is_file():
    for line in env_file.read_text().splitlines():
        key, separator, value = line.partition("=")
        if separator and key in {"SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "KIN_APP_URL"}:
            os.environ.setdefault(key, value.strip())

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
PUBLIC_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
SERVICE_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
MAX_BYTES = 20 * 1024 * 1024
APP_URL = os.environ.get("KIN_APP_URL", "http://127.0.0.1:3000").rstrip("/")


class UpstreamError(Exception):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def tls_context():
    """Use the system trust store, with certifi for Python.org macOS installs."""
    context = ssl.create_default_context()
    if not context.get_ca_certs():
        try:
            import certifi
            context.load_verify_locations(cafile=certifi.where())
        except ImportError as exc:
            raise UpstreamError("No trusted TLS certificates are configured for Python") from exc
    return context


def request(path, method="GET", body=None, token=None, content_type="application/json", service=False, extra=None):
    key = SERVICE_KEY if service else PUBLIC_KEY
    headers = {"apikey": key, "Content-Type": content_type}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    elif not key.startswith("sb_"):
        headers["Authorization"] = f"Bearer {key}"
    if extra:
        headers.update(extra)
    data = json.dumps(body).encode() if isinstance(body, (dict, list)) else body
    try:
        with urlopen(Request(URL + path, data=data, headers=headers, method=method), timeout=60, context=tls_context()) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except HTTPError as exc:
        raise UpstreamError("Supabase rejected the request", status=exc.code) from exc
    except (URLError, TimeoutError, ValueError, ssl.SSLError) as exc:
        raise UpstreamError("Could not securely connect to Supabase") from exc


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # URLs and authentication details must not enter access logs.
        return

    def respond(self, code, data):
        payload = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.headers.get("Host") not in ("127.0.0.1:8787", "localhost:8787"):
            return self.respond(403, {"error": "Invalid host"})
        files = {"/": ("frontend/index.html", "text/html; charset=utf-8"), "/app.js": ("frontend/app.js", "text/javascript; charset=utf-8"), "/results.js": ("frontend/results.js", "text/javascript; charset=utf-8"), "/app.css": ("frontend/app.css", "text/css; charset=utf-8"), "/design.css": ("frontend/design.css", "text/css; charset=utf-8"), "/nav.css": ("frontend/nav.css", "text/css; charset=utf-8")}
        if self.path == "/config":
            return self.respond(200, {"url": URL, "key": PUBLIC_KEY})
        if self.path not in files:
            return self.respond(404, {"error": "Not found"})
        name, content_type = files[self.path]
        data = (Path(__file__).resolve().parent.parent / name).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def confirm(self):
        bearer = self.headers.get("Authorization", "")
        if not bearer.startswith("Bearer "):
            return self.respond(401, {"error": "Sign in required"})
        token = bearer[7:].strip()
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 1024 * 1024:
                raise ValueError()
            data = json.loads(self.rfile.read(size))
            report_id = str(uuid.UUID(data["report_id"]))
            if not isinstance(data["results"], list) or not isinstance(data["date"], str):
                raise ValueError()
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            return self.respond(400, {"error": "Invalid review"})
        try:
            user = request("/auth/v1/user", token=token)
            actors = request(f"/rest/v1/family_members?user_id=eq.{user.get('id')}&select=id,role", token=token)
            if not actors or actors[0]["role"] != "admin":
                return self.respond(403, {"error": "Admin access required"})
            reports = request(f"/rest/v1/reports?id=eq.{report_id}&select=id,status", token=token)
            if not user.get("id") or not reports or reports[0]["status"] != "needs_review":
                return self.respond(403, {"error": "Report not available"})
            request("/rest/v1/rpc/confirm_report_review", method="POST", service=True, body={"p_report": report_id, "p_date": data["date"], "p_results": data["results"]})
        except UpstreamError:
            return self.respond(502, {"error": "Unable to save review. Check all fields and try again."})
        return self.respond(200, {"status": "confirmed"})

    def invite(self):
        bearer = self.headers.get("Authorization", "")
        if not bearer.startswith("Bearer ") or not bearer[7:].strip():
            return self.respond(401, {"error": "Sign in required"})
        token = bearer[7:].strip()
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 4096:
                raise ValueError()
            data = json.loads(self.rfile.read(size))
            email, name, role = data["email"].strip().lower(), data["name"].strip(), data["role"]
            if not email or not name or role not in ("admin", "viewer"):
                raise ValueError()
            parsed = urlparse(APP_URL)
            if not parsed.netloc or parsed.scheme not in ("http", "https") or parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise ValueError()
        except (ValueError, KeyError, TypeError, AttributeError, json.JSONDecodeError):
            return self.respond(400, {"error": "Invalid invitation details or application URL"})
        try:
            user = request("/auth/v1/user", token=token)
            if not user.get("id"):
                return self.respond(401, {"error": "Sign in required"})
            invitation = request("/rest/v1/rpc/prepare_family_invitation", method="POST", token=token, body={"p_email": email, "p_name": name, "p_role": role})
        except UpstreamError as exc:
            if exc.status in (401, 403):
                return self.respond(403, {"error": "Only family admins can send invitations"})
            return self.respond(400, {"error": "Could not prepare invitation. The account may already exist or have a pending invitation."})
        try:
            redirect = APP_URL + "/accept-invite"
            request("/auth/v1/invite?" + urlencode({"redirect_to": redirect}), method="POST", service=True, body={"email": email})
        except UpstreamError as exc:
            if exc.status and 400 <= exc.status < 500:
                try:
                    request("/rest/v1/rpc/cancel_family_invitation", method="POST", token=token, body={"p_id": invitation})
                except UpstreamError:
                    return self.respond(502, {"error": "Invitation failed and cleanup was unsuccessful. Please contact an administrator."})
                return self.respond(502, {"error": "Could not send the invitation. Check your Supabase email configuration and whether the account already exists."})
            return self.respond(502, {"error": "Invitation delivery could not be confirmed. Check your email settings before trying again."})
        return self.respond(200, {"status": "invited"})

    def do_POST(self):
        if self.headers.get("Host") not in ("127.0.0.1:8787", "localhost:8787"):
            return self.respond(403, {"error": "Invalid host"})
        if self.headers.get("Origin") not in ("http://127.0.0.1:8787", "http://localhost:8787"):
            return self.respond(403, {"error": "Invalid origin"})
        if self.path == "/confirm":
            return self.confirm()
        if self.path == "/invite":
            return self.invite()
        if self.path != "/reports":
            return self.respond(404, {"error": "Not found"})
        bearer = self.headers.get("Authorization", "")
        if not bearer.startswith("Bearer ") or not bearer[7:].strip():
            return self.respond(401, {"error": "Sign in required"})
        token = bearer[7:].strip()
        try:
            member_id = str(uuid.UUID(self.headers.get("X-Member-Id", "")))
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.respond(400, {"error": "Valid member ID and content length required"})
        if self.headers.get_content_type() != "application/pdf" or size <= 0 or size > MAX_BYTES:
            return self.respond(400, {"error": "A PDF of up to 20 MiB is required"})
        try:
            # The user-scoped query is filtered by RLS; never trust a caller's
            # proposed role or family membership.
            user = request("/auth/v1/user", token=token)
            actors = request(f"/rest/v1/family_members?user_id=eq.{user.get('id')}&select=id,role", token=token)
            if not actors or actors[0]["role"] != "admin":
                return self.respond(403, {"error": "Admin access required"})
            members = request(f"/rest/v1/family_members?id=eq.{member_id}&select=id,family_id", token=token)
            if not user.get("id") or not members:
                return self.respond(403, {"error": "Profile not accessible"})
        except UpstreamError as exc:
            if exc.status in (401, 403):
                return self.respond(401, {"error": "Your session has expired or was rejected. Please sign in again."})
            return self.respond(502, {"error": str(exc)})
        data = self.rfile.read(size)
        if len(data) != size or not data.startswith(b"%PDF-"):
            return self.respond(400, {"error": "Invalid or incomplete PDF"})
        try:
            with tempfile.TemporaryDirectory(prefix="blood-report-") as directory:
                pdf = Path(directory) / "report.pdf"
                pdf.write_bytes(data)
                parsed = process(pdf)
        except (RuntimeError, subprocess.SubprocessError):
            return self.respond(422, {"error": "Could not process PDF"})
        if parsed["status"] != "needs_review" or parsed["pages_without_candidates"]:
            return self.respond(422, {"error": "Report requires manual processing; scanned, unsupported or unrecognized pages detected"})

        report_id = str(uuid.uuid4())
        object_path = f"{report_id}/original.pdf"
        created = False
        uploaded = False
        try:
            request("/rest/v1/reports", method="POST", service=True, body={"id": report_id, "family_id": members[0]["family_id"], "member_id": member_id, "status": "processing", "storage_path": object_path, "extraction_method": parsed.get("method")}, extra={"Prefer": "return=minimal"})
            created = True
            request(f"/storage/v1/object/blood-reports/{object_path}", method="POST", body=data, service=True, content_type="application/pdf")
            uploaded = True
            rows = [{"report_id": report_id, "source_page": r["page"], "name": r["name"], "raw_value": r["value"], "unit": r["unit"], "reference_lines": r["reference_lines"], "result_type": r["type"], "needs_review": True} for r in parsed["results"]]
            request("/rest/v1/report_results", method="POST", body=rows, service=True, extra={"Prefer": "return=minimal"})
            request(f"/rest/v1/reports?id=eq.{report_id}", method="PATCH", body={"status": "needs_review"}, service=True, extra={"Prefer": "return=minimal"})
        except UpstreamError:
            # Do not report success for partial writes. Cleanup can fail; the
            # report remains marked processing for an operator to investigate.
            if uploaded:
                try:
                    request(f"/storage/v1/object/blood-reports/{object_path}", method="DELETE", service=True)
                except UpstreamError:
                    pass
            if created:
                try:
                    request(f"/rest/v1/reports?id=eq.{report_id}", method="DELETE", service=True)
                except UpstreamError:
                    pass
            return self.respond(502, {"error": "Could not save report; cleanup may require administrator review"})
        return self.respond(201, {"id": report_id, "status": "needs_review", "candidate_count": len(rows)})


if __name__ == "__main__":
    if not all((URL.startswith("https://"), PUBLIC_KEY, SERVICE_KEY)):
        raise SystemExit("Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY")
    from http.server import HTTPServer
    # Bind locally only. Production requires TLS, authentication hardening,
    # rate limiting, a production server, and controlled deployment.
    server = HTTPServer(("127.0.0.1", 8787), Handler)
    print("Kin running at http://127.0.0.1:8787", flush=True)
    server.serve_forever()
