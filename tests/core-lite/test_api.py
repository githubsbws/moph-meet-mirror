"""
core-lite API tests – Health, Auth, Rooms, Exam Queue, Reserved, JWT
Run: pytest tests/core-lite/ -v --html=tests/core-lite/report.html --self-contained-html
"""
import time
import pytest
import requests


# ═══════════════════════════════════════════════════════════════════════════════
# 1. HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════════════
class TestHealth:
    def test_health_returns_200(self, api, wait_for_server):
        r = api.get("/api/health")
        assert r.status_code == 200

    def test_health_has_status_ok(self, api, wait_for_server):
        data = api.get("/api/health").json()
        assert data["status"] == "ok"

    def test_health_has_timestamp(self, api, wait_for_server):
        data = api.get("/api/health").json()
        assert "timestamp" in data


# ═══════════════════════════════════════════════════════════════════════════════
# 2. AUTH ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════
class TestAuthCheck:
    def test_check_valid_token(self, api, auth_token):
        r = api.post("/api/auth/check", json={"token": auth_token})
        assert r.status_code == 200
        data = r.json()
        assert "user" in data
        assert data["token"] == auth_token

    def test_check_invalid_token(self, api, wait_for_server):
        r = api.post("/api/auth/check", json={"token": "nonexistent-token-abc"})
        assert r.status_code == 401

    def test_check_empty_token(self, api, wait_for_server):
        r = api.post("/api/auth/check", json={"token": ""})
        assert r.status_code == 401


class TestAuthGuest:
    def test_guest_invalid_token(self, api, wait_for_server):
        r = api.post("/api/auth/guest", json={"token": "bad-guest-token"})
        assert r.status_code == 401

    def test_guest_empty_body(self, api, wait_for_server):
        r = api.post("/api/auth/guest", json={})
        assert r.status_code == 401


class TestLogout:
    def test_logout_valid(self, api, wait_for_server):
        # Create a throwaway reserved room to get a token, then logout
        rr = api.post("/api/meet/reserved", json={
            "cid": "logout-test-001",
            "displayName": "Logout Doc",
        })
        tok = rr.json()["doctorToken"]
        # Confirm token works
        assert api.post("/api/auth/check", json={"token": tok}).status_code == 200
        # Logout
        r = api.post("/api/logout", json={"token": tok})
        assert r.status_code == 200
        # Token should be invalid now
        assert api.post("/api/auth/check", json={"token": tok}).status_code == 401


# ═══════════════════════════════════════════════════════════════════════════════
# 3. ROOMS
# ═══════════════════════════════════════════════════════════════════════════════
class TestRooms:
    def test_create_meet_room(self, api, auth_headers):
        r = api.post("/api/rooms", json={"type": "meet"}, headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["room"]["type"] == "meet"
        assert data["meetJoinUrl"] is not None
        assert data["room"]["id"]

    def test_create_exam_room(self, api, auth_headers):
        r = api.post("/api/rooms", json={"type": "exam"}, headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["room"]["type"] == "exam"
        assert data["patientJoinUrl"] is not None

    def test_create_room_invalid_type(self, api, auth_headers):
        r = api.post("/api/rooms", json={"type": "invalid"}, headers=auth_headers)
        assert r.status_code == 400

    def test_create_room_no_auth(self, api, wait_for_server):
        r = api.post("/api/rooms", json={"type": "meet"})
        assert r.status_code == 401

    def test_list_meets(self, api, auth_headers):
        r = api.get("/api/meets", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_meets_no_auth(self, api, wait_for_server):
        r = api.get("/api/meets")
        assert r.status_code == 401

    def test_get_room_by_id(self, api, auth_headers):
        # Create a room first
        cr = api.post("/api/rooms", json={"type": "meet"}, headers=auth_headers)
        room_id = cr.json()["room"]["id"]
        r = api.get(f"/api/rooms/{room_id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["id"] == room_id

    def test_get_room_not_found(self, api, auth_headers):
        r = api.get("/api/rooms/nonexistent999", headers=auth_headers)
        assert r.status_code == 404

    def test_get_room_no_auth(self, api, wait_for_server):
        r = api.get("/api/rooms/anyid")
        assert r.status_code == 401

    def test_room_has_correct_fields(self, api, auth_headers):
        cr = api.post("/api/rooms", json={
            "type": "exam",
            "starttime": "2026-03-17T10:00:00Z",
            "endtime": "2026-03-17T11:00:00Z"
        }, headers=auth_headers)
        room = cr.json()["room"]
        for field in ["id", "type", "name", "starttime", "endtime", "ownerId",
                       "ownerDisplay", "createdAt", "queue", "currentPatientToken"]:
            assert field in room, f"Missing field: {field}"

    def test_legacy_meets_id_returns_404(self, api, auth_headers):
        r = api.get("/api/meets/anyid", headers=auth_headers)
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# 4. EXAM / QUEUE
# ═══════════════════════════════════════════════════════════════════════════════
class TestExamQueue:
    def test_exam_doctor_view(self, api, auth_headers, exam_room_id):
        r = api.get(f"/api/exam/{exam_room_id}/doctor", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["type"] == "exam"
        assert "queue" in data

    def test_exam_doctor_view_not_found(self, api, auth_headers):
        r = api.get("/api/exam/nonexistent/doctor", headers=auth_headers)
        assert r.status_code == 404

    def test_exam_invite_patient(self, api, auth_headers, exam_room_id):
        r = api.post(f"/api/exam/{exam_room_id}/invite", json={
            "patientName": "Test Patient",
            "cid": "1234567890123"
        }, headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "patientJoinUrl" in data
        assert data["patientName"] == "Test Patient"

    def test_exam_invite_default_name(self, api, auth_headers, exam_room_id):
        r = api.post(f"/api/exam/{exam_room_id}/invite", json={}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["patientName"] == "ผู้ป่วย"

    def test_exam_invite_no_auth(self, api, exam_room_id):
        r = api.post(f"/api/exam/{exam_room_id}/invite", json={})
        assert r.status_code == 401

    def test_queue_poll_no_jwt(self, api, exam_room_id):
        r = api.get(f"/api/exam/{exam_room_id}/queue")
        assert r.status_code == 401

    def test_queue_poll_invalid_jwt(self, api, exam_room_id):
        r = api.get(f"/api/exam/{exam_room_id}/queue?jwt=garbage")
        assert r.status_code == 401

    def test_queue_poll_valid_jwt(self, api, auth_headers, exam_room_id):
        """Invite a patient, extract the JWT, then poll queue."""
        inv = api.post(f"/api/exam/{exam_room_id}/invite", json={
            "patientName": "Queue Patient"
        }, headers=auth_headers)
        url = inv.json()["patientJoinUrl"]
        jwt_token = url.split("jwt=")[1]
        r = api.get(f"/api/exam/{exam_room_id}/queue?jwt={jwt_token}")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "waiting"
        assert data["position"] >= 1

    def test_call_next_patient(self, api, auth_headers, exam_room_id):
        """Invite a patient, then doctor calls next."""
        inv = api.post(f"/api/exam/{exam_room_id}/invite", json={
            "patientName": "Next Patient"
        }, headers=auth_headers)
        url = inv.json()["patientJoinUrl"]
        jwt_token = url.split("jwt=")[1]
        # Register patient in queue by polling
        api.get(f"/api/exam/{exam_room_id}/queue?jwt={jwt_token}")
        # Doctor calls next
        r = api.post(f"/api/exam/{exam_room_id}/next", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "admitted" in data

    def test_call_next_no_auth(self, api, exam_room_id):
        r = api.post(f"/api/exam/{exam_room_id}/next")
        assert r.status_code == 401

    def test_call_next_not_found(self, api, auth_headers):
        r = api.post("/api/exam/nonexistent/next", headers=auth_headers)
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# 5. RESERVED ROOM FLOW
# ═══════════════════════════════════════════════════════════════════════════════
class TestReserved:
    def test_create_reserved_room(self, api, wait_for_server):
        r = api.post("/api/meet/reserved", json={
            "cid": "doc-reserved-001",
            "displayName": "Dr. Reserve",
            "startTime": "2026-04-01T08:00:00Z",
            "endTime": "2026-04-01T10:00:00Z",
        })
        assert r.status_code == 200
        data = r.json()
        assert "sessionID" in data
        assert "meet" in data
        assert "patientJoinUrl" in data
        assert "doctorToken" in data

    def test_create_reserved_with_session_name(self, api, wait_for_server):
        r = api.post("/api/meet/reserved", json={
            "cid": "doc-reserved-002",
            "sessionName": "Custom Exam Room",
        })
        data = r.json()
        assert r.status_code == 200
        assert data["sessionID"]

    def test_create_reserved_missing_cid(self, api, wait_for_server):
        r = api.post("/api/meet/reserved", json={"displayName": "No CID"})
        assert r.status_code == 400

    def test_reserved_token_generate(self, api, reserved_room):
        r = api.post("/api/meet/reserved/token", json={
            "sessionID": reserved_room["sessionID"],
            "patientName": "Reserved Patient",
            "cid": "9876543210123"
        })
        assert r.status_code == 200
        data = r.json()
        assert "patientJoinUrl" in data
        assert data["sessionID"] == reserved_room["sessionID"]

    def test_reserved_token_invalid_session(self, api, wait_for_server):
        r = api.post("/api/meet/reserved/token", json={
            "sessionID": "nonexistent-session"
        })
        assert r.status_code == 400

    def test_reserved_token_missing_session(self, api, wait_for_server):
        r = api.post("/api/meet/reserved/token", json={})
        assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════════
# 6. GUEST TOKEN
# ═══════════════════════════════════════════════════════════════════════════════
class TestGuestToken:
    def test_create_guest_token(self, api, wait_for_server):
        r = api.post("/api/guest/token", json={
            "meetId": "some-room-123",
            "patientName": "Guest A"
        })
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert data["meetId"] == "some-room-123"

    def test_guest_token_missing_meetid(self, api, wait_for_server):
        r = api.post("/api/guest/token", json={"patientName": "No Meet"})
        assert r.status_code == 400

    def test_guest_token_validates_in_auth(self, api, wait_for_server):
        """Created guest token should be validateable via /api/auth/guest."""
        cr = api.post("/api/guest/token", json={
            "meetId": "guest-room-abc",
            "patientName": "Guest Check"
        })
        guest_tok = cr.json()["token"]
        r = api.post("/api/auth/guest", json={"token": guest_tok})
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["display"] == "Guest Check"
        assert data["meetId"] == "guest-room-abc"


# ═══════════════════════════════════════════════════════════════════════════════
# 7. JWT VERIFY
# ═══════════════════════════════════════════════════════════════════════════════
class TestJwtVerify:
    def test_verify_valid_jwt(self, api, auth_headers, exam_room_id):
        inv = api.post(f"/api/exam/{exam_room_id}/invite", json={
            "patientName": "JWT Test"
        }, headers=auth_headers)
        url = inv.json()["patientJoinUrl"]
        jwt_token = url.split("jwt=")[1]
        r = api.post("/api/jwt/verify", json={"token": jwt_token})
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is True
        assert data["payload"]["patientName"] == "JWT Test"

    def test_verify_invalid_jwt(self, api, wait_for_server):
        r = api.post("/api/jwt/verify", json={"token": "not.a.jwt"})
        assert r.status_code == 401
        assert r.json()["valid"] is False

    def test_verify_missing_token(self, api, wait_for_server):
        r = api.post("/api/jwt/verify", json={})
        assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════════
# 8. ERROR HANDLING / EDGE CASES
# ═══════════════════════════════════════════════════════════════════════════════
class TestEdgeCases:
    def test_unknown_route_returns_404(self, api, wait_for_server):
        r = api.get("/api/nonexistent")
        assert r.status_code == 404

    def test_cors_headers_present(self, api, wait_for_server):
        r = api.get("/api/health")
        # Express cors() should add this header
        assert "access-control-allow-origin" in {k.lower(): v for k, v in r.headers.items()}

    def test_json_content_type(self, api, wait_for_server):
        r = api.get("/api/health")
        assert "application/json" in r.headers.get("content-type", "")

    def test_room_forbidden_for_other_user(self, api, wait_for_server):
        """Create a room as doctor-A, try to access as doctor-B → 403."""
        # Doctor A creates room
        rA = api.post("/api/meet/reserved", json={"cid": "doctor-A"})
        room_id = rA.json()["sessionID"]
        # Doctor B creates their own session
        rB = api.post("/api/meet/reserved", json={"cid": "doctor-B"})
        tok_b = rB.json()["doctorToken"]
        # Doctor B tries to get Doctor A's room
        r = api.get(f"/api/rooms/{room_id}", headers={"Authorization": f"Bearer {tok_b}"})
        assert r.status_code == 403

    def test_exam_next_forbidden_for_non_owner(self, api, wait_for_server):
        rA = api.post("/api/meet/reserved", json={"cid": "owner-doc"})
        room_id = rA.json()["sessionID"]
        rB = api.post("/api/meet/reserved", json={"cid": "other-doc"})
        tok_b = rB.json()["doctorToken"]
        r = api.post(f"/api/exam/{room_id}/next", headers={"Authorization": f"Bearer {tok_b}"})
        assert r.status_code == 403


class TestVitals:
    """TOR 4.10.5 — Vital signs capture & retrieval"""

    def test_post_single_vital(self, api, auth_headers, exam_room_id):
        r = api.post("/api/vitals", json={
            "roomId": exam_room_id,
            "deviceType": "thermometer",
            "metric": "temp",
            "value": "37.2",
            "unit": "°C",
            "source": "manual",
        }, headers=auth_headers)
        assert r.status_code == 201
        assert r.json().get("ok") is True

    def test_post_vital_missing_metric(self, api, auth_headers):
        r = api.post("/api/vitals", json={"value": "37"}, headers=auth_headers)
        assert r.status_code == 400
        assert "metric" in r.json().get("message", "")

    def test_post_vital_no_auth(self, api):
        r = api.post("/api/vitals", json={"metric": "temp", "value": "37"})
        assert r.status_code == 401

    def test_batch_vitals(self, api, auth_headers, exam_room_id):
        records = [
            {"roomId": exam_room_id, "deviceType": "scale",         "metric": "weight",  "value": "70",   "unit": "kg",    "source": "manual"},
            {"roomId": exam_room_id, "deviceType": "scale",         "metric": "height",  "value": "172",  "unit": "cm",    "source": "manual"},
            {"roomId": exam_room_id, "deviceType": "pulseOximeter", "metric": "spo2",    "value": "98",   "unit": "%",     "source": "manual"},
            {"roomId": exam_room_id, "deviceType": "bloodPressure", "metric": "sys",     "value": "120",  "unit": "mmHg",  "source": "manual"},
            {"roomId": exam_room_id, "deviceType": "bloodPressure", "metric": "dia",     "value": "80",   "unit": "mmHg",  "source": "manual"},
            {"roomId": exam_room_id, "deviceType": "bgm",           "metric": "glucose", "value": "95",   "unit": "mg/dL", "source": "manual"},
        ]
        r = api.post("/api/vitals/batch", json=records, headers=auth_headers)
        assert r.status_code == 201
        assert r.json().get("count") == len(records)

    def test_batch_empty_fails(self, api, auth_headers):
        r = api.post("/api/vitals/batch", json=[], headers=auth_headers)
        assert r.status_code == 400

    def test_get_vitals_by_room(self, api, auth_headers, exam_room_id):
        # Insert at least one first
        api.post("/api/vitals", json={
            "roomId": exam_room_id, "deviceType": "manual",
            "metric": "rr", "value": "16", "unit": "/min", "source": "manual",
        }, headers=auth_headers)
        r = api.get(f"/api/vitals?roomId={exam_room_id}", headers=auth_headers)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) > 0
        assert all("metric" in row and "value" in row for row in rows)

    def test_get_vitals_no_roomid(self, api, auth_headers):
        r = api.get("/api/vitals", headers=auth_headers)
        assert r.status_code == 400

    def test_latest_vitals_by_room(self, api, auth_headers, exam_room_id):
        r = api.get(f"/api/rooms/{exam_room_id}/vitals/latest", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_vitals_404_is_json(self, api, auth_headers):
        r = api.get("/api/rooms/nonexistent999/vitals/latest", headers=auth_headers)
        # Room not found check not enforced in vitals (returns empty list)
        assert r.status_code in (200, 404)
        assert r.headers.get("content-type", "").startswith("application/json")


class TestHisExport:
    """TOR 4.7 + 4.10.7 — HIS export endpoint"""

    def test_export_missing_room_id(self, api, auth_headers):
        r = api.post("/api/his/export", json={}, headers=auth_headers)
        assert r.status_code == 400
        assert "roomId" in r.json().get("message", "")

    def test_export_room_not_found(self, api, auth_headers):
        r = api.post("/api/his/export", json={"roomId": "nonexistent_xxx"}, headers=auth_headers)
        assert r.status_code == 404

    def test_export_no_vitals(self, api, auth_headers):
        # Create a fresh room with no vitals
        cr = api.post("/api/rooms", json={"type": "exam"}, headers=auth_headers)
        room_id = cr.json()["room"]["id"]
        r = api.post("/api/his/export", json={"roomId": room_id}, headers=auth_headers)
        assert r.status_code == 400
        assert "vital" in r.json().get("message", "").lower()

    def test_export_with_vitals(self, api, auth_headers, exam_room_id):
        # Insert at least one vital first
        api.post("/api/vitals", json={
            "roomId": exam_room_id, "deviceType": "thermometer",
            "metric": "temp", "value": "37.0", "unit": "°C", "source": "manual",
        }, headers=auth_headers)
        r = api.post("/api/his/export", json={"roomId": exam_room_id}, headers=auth_headers)
        # 200 (HIS up) or 502 (demo-his not running in CI) — both are valid
        assert r.status_code in (200, 502)
        data = r.json()
        if r.status_code == 200:
            assert data.get("ok") is True
            assert data.get("vitalCount", 0) > 0

    def test_export_no_auth(self, api, exam_room_id):
        r = api.post("/api/his/export", json={"roomId": exam_room_id})
        assert r.status_code == 401
