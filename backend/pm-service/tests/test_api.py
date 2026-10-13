"""Integration tests: real handler, real PostgreSQL, full RBAC flows."""

import pytest


@pytest.fixture(scope="module")
def world(api):
    """Admin, two managers, a team each, two employees and one project."""
    status, body = api("POST", "/auth/login", {"login": "admin@acme.com", "password": "AdminPass1!"})
    assert status == 200, body
    admin = body["token"]

    def make_user(email, role, team_id=None):
        s, b = api("POST", "/users", {"first_name": "T", "last_name": email.split("@")[0], "email": email,
                                      "password": "Password1!", "role": role, "team_id": team_id}, admin)
        assert s == 201, b
        token = api("POST", "/auth/login", {"login": email, "password": "Password1!"})[1]["token"]
        return b, token

    mgr, mgr_tok = make_user("mgr@acme.com", "manager")
    mgr2, mgr2_tok = make_user("mgr2@acme.com", "manager")
    team = api("POST", "/teams", {"name": "Platform", "department": "IT"}, mgr_tok)[1]
    team2 = api("POST", "/teams", {"name": "Data", "department": "IT"}, mgr2_tok)[1]
    emp, emp_tok = make_user("emp@acme.com", "employee", team["id"])
    outsider, out_tok = make_user("out@acme.com", "employee", team2["id"])
    s, project = api("POST", "/projects", {
        "name": "Server decommission", "start_date": "2026-01-01", "end_date": "2026-12-31",
        "allocated_hours": 1000, "budget": 50000, "manager_id": mgr["id"]}, admin)
    assert s == 201, project
    assert api("POST", f"/projects/{project['id']}/teams", {"team_id": team["id"]}, mgr_tok)[0] == 201
    return {"admin": admin, "mgr": mgr, "mgr_tok": mgr_tok, "mgr2_tok": mgr2_tok, "team": team, "team2": team2,
            "emp": emp, "emp_tok": emp_tok, "out_tok": out_tok, "project": project}


def test_requires_token(api):
    assert api("GET", "/projects")[0] == 401
    assert api("GET", "/projects", token="garbage")[1]["error"]["code"] == "invalid_token"


def test_bad_login(api):
    status, body = api("POST", "/auth/login", {"login": "admin@acme.com", "password": "nope"})
    assert status == 401 and body["error"]["code"] == "invalid_credentials"


def test_generated_username_is_six_chars(world):
    assert len(world["emp"]["username"]) == 6


def test_salary_hidden_from_non_admin(api, world):
    api("PUT", f"/users/{world['emp']['id']}", {"salary": 90000}, world["admin"])
    assert api("GET", f"/users/{world['emp']['id']}", token=world["admin"])[1]["salary"] == 90000
    assert "salary" not in api("GET", f"/users/{world['emp']['id']}", token=world["mgr_tok"])[1]


def test_employee_cannot_escalate(api, world):
    assert api("PUT", f"/users/{world['emp']['id']}", {"role": "admin"}, world["emp_tok"])[0] == 403
    status, me = api("PUT", "/auth/me", {"first_name": "Erin", "role": "admin"}, world["emp_tok"])
    assert status == 200 and me["first_name"] == "Erin" and me["role"] == "employee"


def test_only_admin_creates_projects(api, world):
    body = {"name": "X", "start_date": "2026-01-01", "end_date": "2026-02-01", "allocated_hours": 1,
            "manager_id": world["mgr"]["id"]}
    assert api("POST", "/projects", body, world["mgr_tok"])[0] == 403


def test_project_date_validation(api, world):
    status, body = api("POST", "/projects", {"name": "Bad", "start_date": "2026-05-01", "end_date": "2026-04-01",
                                             "allocated_hours": 1, "manager_id": world["mgr"]["id"]}, world["admin"])
    assert status == 400 and "end_date" in body["error"]["details"]["fields"]


def test_visibility_by_team(api, world):
    pid = world["project"]["id"]
    assert api("GET", f"/projects/{pid}", token=world["emp_tok"])[0] == 200
    assert api("GET", f"/projects/{pid}", token=world["out_tok"])[0] == 404
    assert api("GET", "/projects", token=world["out_tok"])[1]["total"] == 0


def test_other_manager_cannot_edit(api, world):
    pid = world["project"]["id"]
    assert api("PUT", f"/projects/{pid}", {"budget": 1}, world["mgr2_tok"])[0] == 404
    assert api("PUT", f"/projects/{pid}", {"budget": 60000}, world["mgr_tok"])[0] == 200


def test_manager_cannot_assign_foreign_team(api, world):
    pid = world["project"]["id"]
    assert api("POST", f"/projects/{pid}/teams", {"team_id": world["team2"]["id"]}, world["mgr_tok"])[0] == 403


def test_deliverables_dependencies_and_completion(api, world):
    pid, tok = world["project"]["id"], world["mgr_tok"]
    s, d1 = api("POST", f"/projects/{pid}/deliverables",
                {"name": "Inventory", "start_date": "2026-01-01", "end_date": "2026-02-01",
                 "assignee_ids": [world["emp"]["id"]]}, tok)
    assert s == 201 and d1["seq_no"] == 1 and d1["assignees"][0]["id"] == world["emp"]["id"]
    d2 = api("POST", f"/projects/{pid}/deliverables",
             {"name": "Decommission 200 servers", "start_date": "2026-02-01", "end_date": "2026-06-01"}, tok)[1]
    assert d2["seq_no"] == 2
    outside = api("POST", f"/projects/{pid}/deliverables",
                  {"name": "Late", "start_date": "2026-01-01", "end_date": "2027-06-01"}, tok)
    assert outside[0] == 400
    assert api("POST", f"/deliverables/{d2['id']}/dependencies", {"depends_on_id": d1["id"]}, tok)[0] == 201
    assert api("POST", f"/deliverables/{d1['id']}/dependencies", {"depends_on_id": d2["id"]}, tok)[0] == 409
    assert api("POST", f"/deliverables/{d2['id']}/complete", token=tok)[0] == 409
    graph = api("GET", f"/projects/{pid}/dependency-graph", token=world["emp_tok"])[1]
    assert graph["order"] == [d1["id"], d2["id"]] and graph["blocked"] == [d2["id"]]
    assert api("POST", f"/deliverables/{d1['id']}/complete", token=world["emp_tok"])[0] == 403
    assert api("POST", f"/deliverables/{d1['id']}/complete", token=tok)[0] == 200
    assert api("POST", f"/deliverables/{d2['id']}/complete", token=tok)[0] == 200


def test_allocation_over_100_warns_and_shows_in_report(api, world):
    pid, tok, admin = world["project"]["id"], world["mgr_tok"], world["admin"]
    p2 = api("POST", "/projects", {"name": "Second", "start_date": "2026-01-01", "end_date": "2026-12-31",
                                   "allocated_hours": 10, "manager_id": world["mgr"]["id"]}, admin)[1]
    api("POST", f"/projects/{p2['id']}/teams", {"team_id": world["team"]["id"]}, tok)
    body = {"user_id": world["emp"]["id"], "allocation_percent": 70, "start_date": "2026-01-01",
            "end_date": "2026-12-31"}
    s1, a1 = api("POST", "/allocations", {**body, "project_id": pid}, tok)
    assert s1 == 201 and a1["warning"] is None
    s2, a2 = api("POST", "/allocations", {**body, "project_id": p2["id"]}, tok)
    assert s2 == 201 and "140%" in a2["warning"]
    report = api("GET", "/reports/resources", token=tok, query={"date": "2026-06-01"})[1]
    row = next(r for r in report["items"] if r["id"] == world["emp"]["id"])
    assert row["status"] == "over_allocated" and row["total_percent"] == 140
    assert api("GET", "/reports/resources", token=world["emp_tok"])[0] == 403


def test_time_and_budget_tracking(api, world):
    pid = world["project"]["id"]
    s, entry = api("POST", "/time-entries", {"project_id": pid, "work_date": "2026-03-02", "hours": 6},
                   world["emp_tok"])
    assert s == 201
    assert api("POST", "/time-entries", {"project_id": pid, "work_date": "2026-03-02", "hours": 20},
               world["emp_tok"])[0] == 400
    assert api("POST", "/time-entries", {"project_id": pid, "work_date": "2026-03-02", "hours": 2},
               world["out_tok"])[0] == 404
    assert api("POST", f"/projects/{pid}/expenses",
               {"category": "hardware", "amount": 12500.5, "spent_on": "2026-03-01"}, world["mgr_tok"])[0] == 201
    assert api("POST", f"/projects/{pid}/expenses",
               {"category": "hardware", "amount": 1, "spent_on": "2026-03-01"}, world["emp_tok"])[0] == 403
    project = api("GET", f"/projects/{pid}", token=world["mgr_tok"])[1]
    assert project["budget_spent"] == 12500.5 and project["hours_logged"] == 6
    assert project["health"]["budget_used_pct"] is not None


def test_dashboard(api, world):
    status, body = api("GET", "/reports/dashboard", token=world["mgr_tok"])
    assert status == 200 and body["active_projects"] >= 1
    assert set(body["risk_counts"]) == {"on_track", "at_risk", "high_risk"}


def test_complete_archives_and_hides_from_manager(api, world):
    admin, tok = world["admin"], world["mgr_tok"]
    p = api("POST", "/projects", {"name": "Short", "start_date": "2026-01-01", "end_date": "2026-03-01",
                                  "allocated_hours": 5, "manager_id": world["mgr"]["id"]}, admin)[1]
    assert api("POST", f"/projects/{p['id']}/status", {"status": "abandoned"}, tok)[0] == 403
    s, closed = api("POST", f"/projects/{p['id']}/status", {"status": "completed"}, tok)
    assert s == 200 and closed["is_archived"] is True
    assert api("GET", f"/projects/{p['id']}", token=tok)[0] == 404
    assert api("GET", f"/projects/{p['id']}", token=admin)[0] == 200
    assert api("POST", f"/projects/{p['id']}/restore", token=admin)[1]["status"] == "active"


def test_audit_log_admin_only_and_append_only(api, world):
    assert api("GET", "/audit-log", token=world["mgr_tok"])[0] == 403
    status, log = api("GET", "/audit-log", token=world["admin"], query={"entity_type": "project"})
    assert status == 200 and log["total"] > 0
    from app import db
    import psycopg
    with pytest.raises(psycopg.errors.RaiseException):
        db.get_conn().execute("DELETE FROM audit_log")


def test_unknown_route_and_bad_id(api, world):
    assert api("GET", "/nope", token=world["admin"])[0] == 404
    assert api("GET", "/projects/not-a-uuid", token=world["admin"])[0] == 404
