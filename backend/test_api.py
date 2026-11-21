import io
import json
import unittest
from email.message import Message
from unittest.mock import Mock, patch

from server import Handler, UpstreamError


class UploadTests(unittest.TestCase):
    def post(self, headers, body=b"%PDF-test"):
        handler = object.__new__(Handler)
        handler.path = "/reports"
        handler.headers = Message()
        handler.headers["Host"] = "127.0.0.1:8787"
        handler.headers["Origin"] = "http://127.0.0.1:8787"
        for key, value in headers.items():
            handler.headers[key] = value
        handler.headers["Content-Length"] = str(len(body))
        handler.rfile = io.BytesIO(body)
        handler.respond = Mock()
        handler.do_POST()
        return handler.respond.call_args.args

    def test_missing_token_is_rejected(self):
        status, _ = self.post({"Content-Type": "application/pdf"})
        self.assertEqual(status, 401)

    def test_other_family_member_is_rejected_before_upload(self):
        with patch("server.request", side_effect=[{"id": "user"}, [{"role": "admin"}], []]) as upstream:
            status, _ = self.post({"Content-Type": "application/pdf", "Authorization": "Bearer token", "X-Member-Id": "00000000-0000-4000-8000-000000000001"})
        self.assertEqual(status, 403)
        self.assertEqual(upstream.call_count, 3)

    def test_viewer_cannot_upload(self):
        with patch("server.request", side_effect=[{"id": "user"}, [{"role": "viewer"}]]) as upstream:
            status, _ = self.post({"Content-Type": "application/pdf", "Authorization": "Bearer token", "X-Member-Id": "00000000-0000-4000-8000-000000000001"})
        self.assertEqual(status, 403)
        self.assertEqual(upstream.call_count, 2)

    def test_viewer_cannot_confirm_review(self):
        handler = object.__new__(Handler)
        handler.headers = Message()
        handler.headers['Authorization'] = 'Bearer token'
        body = json.dumps({'report_id': '00000000-0000-4000-8000-000000000001', 'date': '2026-01-01', 'results': []}).encode()
        handler.headers['Content-Length'] = str(len(body))
        handler.rfile = io.BytesIO(body)
        handler.respond = Mock()
        with patch('server.request', side_effect=[{'id': 'user'}, [{'role': 'viewer'}]]) as upstream:
            handler.confirm()
        self.assertEqual(handler.respond.call_args.args[0], 403)
        self.assertEqual(upstream.call_count, 2)

    def invite(self):
        handler = object.__new__(Handler)
        handler.headers = Message()
        handler.headers['Authorization'] = 'Bearer token'
        body = json.dumps({'email': 'family@example.com', 'name': 'Family', 'role': 'viewer'}).encode()
        handler.headers['Content-Length'] = str(len(body))
        handler.rfile = io.BytesIO(body)
        handler.respond = Mock()
        handler.invite()
        return handler.respond.call_args.args

    def test_invitation_prepared_before_email_sent(self):
        with patch('server.request', side_effect=[{'id': 'admin'}, 'invite-id', {'id': 'new-user'}]) as upstream:
            status, _ = self.invite()
        self.assertEqual(status, 200)
        self.assertIn('prepare_family_invitation', upstream.call_args_list[1].args[0])
        self.assertIn('/auth/v1/invite?', upstream.call_args_list[2].args[0])
        self.assertTrue(upstream.call_args_list[2].kwargs['service'])

    def test_invitation_rejects_non_admin(self):
        with patch('server.request', side_effect=[{'id': 'viewer'}, UpstreamError('denied', 403)]) as upstream:
            status, _ = self.invite()
        self.assertEqual(status, 403)
        self.assertEqual(upstream.call_count, 2)

    def test_failed_email_cancels_pending_invitation(self):
        with patch('server.request', side_effect=[{'id': 'admin'}, 'invite-id', UpstreamError('email denied', 422), None]) as upstream:
            status, _ = self.invite()
        self.assertEqual(status, 502)
        self.assertIn('cancel_family_invitation', upstream.call_args_list[3].args[0])

    def test_unrecognized_pages_are_never_saved(self):
        fake = {"status": "needs_review", "pages_without_candidates": [2], "results": []}
        with patch("server.request", side_effect=[{"id": "user"}, [{"role": "admin"}], [{"family_id": "family"}]]) as upstream, patch("server.process", return_value=fake):
            status, _ = self.post({"Content-Type": "application/pdf", "Authorization": "Bearer token", "X-Member-Id": "00000000-0000-4000-8000-000000000001"})
        self.assertEqual(status, 422)
        self.assertEqual(upstream.call_count, 3)

    def test_valid_report_creates_private_review_candidates(self):
        fake = {"status": "needs_review", "pages_without_candidates": [], "results": [{"page": 1, "name": "Example", "value": "1.2", "unit": "mg/dL", "reference_lines": ["1-2"], "type": "numeric"}]}
        with patch("server.request", side_effect=[{"id": "user"}, [{"role": "admin"}], [{"family_id": "family"}], None, {}, None, None]) as upstream, patch("server.process", return_value=fake):
            status, result = self.post({"Content-Type": "application/pdf", "Authorization": "Bearer token", "X-Member-Id": "00000000-0000-4000-8000-000000000001"})
        self.assertEqual(status, 201)
        self.assertEqual(result["status"], "needs_review")
        self.assertEqual(result["candidate_count"], 1)
        rows = upstream.call_args_list[5].kwargs["body"]
        self.assertTrue(rows[0]["needs_review"])


if __name__ == "__main__":
    unittest.main()
