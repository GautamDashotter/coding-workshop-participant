"""More CRUD coverage: lists, filters, updates, deletes and restores."""

import pytest


@pytest.fixture(scope="module")
def ctx(api):
    admin = api("POST", "/auth/login", {"login": "admin@acme.com", "password": "AdminPass1!"})[1]["token"]
    mgr = api("POST", "/users", {"first_name": "Mo", "last_name": "Mgr", "email": "mo@acme.com",
                                 "password": "Password1!", "role": "manager"}, admin)[1]
    mgr_tok = api("POST", "/auth/login", {"login": "mo@acme.com", "password": "Password1!"})[1]["token"]
    team = api("POST", "/teams", {"name": "Ops", "department": "IT"}, mgr_tok)[1]
    emp = api("POST", "/users", {"first_name": "Eve", "last_name": "Emp", "email": "eve@acme.com",
                                 "password": "Password1!", "role": "employee", "team_id": team["id"]}, admin)[1]
    emp_tok = api("POST", "/auth/login", {"login": emp["username"], "password": "Password1!"})[1]["token"]
    project = api("POST", "/projects", {"name": "CRUD project", "description": "Migrate the data lake",
                                        "department": "IT", "start_date": "2026-01-01",
                                        "end_date": "2026-12-31", "allocated_hours": 100, "budget": 1000,
                                        "manager_id": mgr["id"]}, admin)[1]
    api("POST", f"/projects/{project['id']}/teams", {"team_id": team["id"]}, mgr_tok)
    return locals()


def test_user_lifecycle(api, ctx):
    admin = ctx["admin"]
    listing = api("GET", "/users", token=admin, query={"search": "eve", "role": "employee"})[1]
    assert listing["total"] == 1
    assert api("GET", "/users", token=ctx["emp_tok"])[0] == 403
    dup = api("POST", "/users", {"first_name": "A", "last_name": "B", "email": "eve@acme.com",
                                 "password": "Password1!", "team_id": ctx["team"]["id"]}, admin)
    assert dup[0] == 409
    no_team = api("POST", "/users", {"first_name": "A", "last_name": "B", "email": "x@acme.com",
                                     "password": "Password1!"}, admin)
    assert no_team[0] == 400 and "team_id" in no_team[1]["error"]["details"]["fields"]
    short = api("POST", "/users", {"first_name": "A", "last_name": "B", "email": "y@acme.com",
                                   "password": "short", "role": "manager"}, admin)
    assert short[0] == 400
    temp = api("POST", "/users", {"first_name": "Tmp", "last_name": "User", "email": "tmp@acme.com",
                                  "password": "Password1!", "role": "manager"}, admin)[1]
    assert api("PUT", f"/users/{temp['id']}", {"role": "admin"}, admin)[1]["role"] == "admin"
    assert api("PUT", f"/users/{temp['id']}", {}, admin)[0] == 400
    assert api("DELETE", f"/users/{temp['id']}", token=admin)[0] == 204
    assert api("GET", f"/users/{temp['id']}", token=ctx["mgr_tok"])[0] == 404
    assert api("POST", f"/users/{temp['id']}/restore", token=admin)[0] == 200
    me = api("GET", "/auth/me", token=admin)[1]
    assert api("DELETE", f"/users/{me['id']}", token=admin)[0] == 403
    assert api("PUT", f"/users/{me['id']}", {"role": "employee"}, admin)[0] == 403


def test_password_change_and_refresh(api, ctx):
    tok = ctx["emp_tok"]
    bad = api("POST", "/auth/password", {"current_password": "nope", "new_password": "Password2!"}, tok)
    assert bad[0] == 400
    assert api("POST", "/auth/password", {"current_password": "Password1!", "new_password": "tiny"}, tok)[0] == 400
    assert api("POST", "/auth/password", {"current_password": "Password1!", "new_password": "Password2!"},
               tok)[0] == 200
    assert api("POST", "/auth/login", {"login": "eve@acme.com", "password": "Password2!"})[0] == 200
    assert "token" in api("POST", "/auth/refresh", token=tok)[1]
    assert api("PUT", "/auth/me", {}, tok)[0] == 400


def test_team_crud(api, ctx):
    admin, mgr_tok = ctx["admin"], ctx["mgr_tok"]
    assert api("POST", "/teams", {"name": "Nope"}, ctx["emp_tok"])[0] == 403
    assert api("GET", "/teams", token=mgr_tok, query={"mine": "true"})[1]["total"] == 1
    assert api("GET", "/teams", token=ctx["emp_tok"], query={"search": "ops"})[1]["total"] >= 1
    team = api("GET", f"/teams/{ctx['team']['id']}", token=mgr_tok)[1]
    assert team["members"][0]["email"] == "eve@acme.com"
    assert api("PUT", f"/teams/{team['id']}", {"name": "Ops & Infra"}, mgr_tok)[1]["name"] == "Ops & Infra"
    assert api("PUT", f"/teams/{team['id']}", {"manager_id": ctx["mgr"]["id"]}, mgr_tok)[0] == 403
    assert api("PUT", f"/teams/{team['id']}", {}, mgr_tok)[0] == 400
    assert api("DELETE", f"/teams/{team['id']}", token=admin)[0] == 400
    empty = api("POST", "/teams", {"name": "Empty", "manager_id": ctx["mgr"]["id"]}, admin)[1]
    assert api("DELETE", f"/teams/{empty['id']}", token=admin)[0] == 204
    assert api("GET", "/teams/00000000-0000-0000-0000-000000000000", token=admin)[0] == 404


def test_project_filters_people_and_unassign(api, ctx):
    pid, admin, mgr_tok = ctx["project"]["id"], ctx["admin"], ctx["mgr_tok"]
    assert api("GET", "/projects", token=admin, query={"search": "data lake"})[1]["total"] == 1
    assert api("GET", "/projects", token=admin, query={"status": "active", "department": "IT",
                                                        "manager_id": ctx["mgr"]["id"], "risk": "on_track"})[0] == 200
    people = api("GET", f"/projects/{pid}/people", token=ctx["emp_tok"])[1]
    assert people["items"][0]["first_name"] == "Eve"
    assert api("PUT", f"/projects/{pid}", {"manager_id": ctx["mgr"]["id"]}, mgr_tok)[0] == 200
    assert api("PUT", f"/projects/{pid}", {"end_date": "2025-01-01"}, mgr_tok)[0] == 400
    spare = api("POST", "/teams", {"name": "Spare"}, mgr_tok)[1]
    api("POST", f"/projects/{pid}/teams", {"team_id": spare["id"]}, mgr_tok)
    assert api("POST", f"/projects/{pid}/teams", {"team_id": spare["id"]}, mgr_tok)[0] == 409
    assert api("DELETE", f"/projects/{pid}/teams/{spare['id']}", token=mgr_tok)[0] == 204
    assert api("DELETE", f"/projects/{pid}/teams/{spare['id']}", token=mgr_tok)[0] == 404


def test_deliverable_update_list_archive(api, ctx):
    pid, tok = ctx["project"]["id"], ctx["mgr_tok"]
    a = api("POST", f"/projects/{pid}/deliverables", {"name": "Design", "start_date": "2026-02-01",
                                                      "end_date": "2026-03-01"}, tok)[1]
    b = api("POST", f"/projects/{pid}/deliverables", {"name": "Build", "start_date": "2026-03-01",
                                                      "end_date": "2026-05-01"}, tok)[1]
    upd = api("PUT", f"/deliverables/{a['id']}", {"status": "in_progress", "assignee_ids": [ctx["emp"]["id"]]},
              tok)[1]
    assert upd["status"] == "in_progress" and len(upd["assignees"]) == 1
    assert api("PUT", f"/deliverables/{a['id']}", {"assignee_ids": [ctx["mgr"]["id"]]}, tok)[0] == 400
    assert api("GET", f"/projects/{pid}/deliverables", token=ctx["emp_tok"],
               query={"status": "in_progress", "search": "des"})[1]["total"] == 1
    assert api("GET", f"/deliverables/{a['id']}", token=ctx["emp_tok"])[0] == 200
    api("POST", f"/deliverables/{b['id']}/dependencies", {"depends_on_id": a["id"]}, tok)
    assert api("POST", f"/deliverables/{b['id']}/dependencies", {"depends_on_id": b["id"]}, tok)[0] == 400
    assert api("DELETE", f"/deliverables/{b['id']}/dependencies/{a['id']}", token=tok)[0] == 204
    assert api("DELETE", f"/deliverables/{b['id']}/dependencies/{a['id']}", token=tok)[0] == 404
    assert api("DELETE", f"/deliverables/{b['id']}", token=tok)[0] == 204
    assert api("GET", f"/deliverables/{b['id']}", token=tok)[0] == 404
    api("POST", f"/deliverables/{a['id']}/complete", token=tok)
    assert api("PUT", f"/deliverables/{a['id']}", {"name": "x"}, tok)[0] == 403
    assert api("POST", f"/deliverables/{a['id']}/complete", token=tok)[0] == 400


def test_allocation_update_and_delete(api, ctx):
    pid, tok = ctx["project"]["id"], ctx["mgr_tok"]
    body = {"project_id": pid, "user_id": ctx["emp"]["id"], "allocation_percent": 50,
            "start_date": "2026-01-01", "end_date": "2026-06-30"}
    alloc = api("POST", "/allocations", body, tok)[1]
    assert api("POST", "/allocations", {**body, "user_id": ctx["mgr"]["id"]}, tok)[0] == 400
    assert api("POST", "/allocations", {**body, "allocation_percent": 150}, tok)[0] == 400
    upd = api("PUT", f"/allocations/{alloc['id']}", {"allocation_percent": 120}, tok)
    assert upd[0] == 400
    upd = api("PUT", f"/allocations/{alloc['id']}", {"allocation_percent": 80}, tok)[1]
    assert upd["allocation_percent"] == 80
    assert api("PUT", f"/allocations/{alloc['id']}", {}, tok)[0] == 400
    assert api("GET", "/allocations", token=ctx["emp_tok"])[1]["total"] >= 1
    assert api("GET", "/allocations", token=tok, query={"project_id": pid})[1]["total"] >= 1
    assert api("DELETE", f"/allocations/{alloc['id']}", token=ctx["emp_tok"])[0] == 403
    assert api("DELETE", f"/allocations/{alloc['id']}", token=tok)[0] == 204
    assert api("DELETE", f"/allocations/{alloc['id']}", token=tok)[0] == 404


def test_time_entry_list_and_delete(api, ctx):
    pid = ctx["project"]["id"]
    entry = api("POST", "/time-entries", {"project_id": pid, "work_date": "2026-04-01", "hours": 3,
                                          "note": "Planning"}, ctx["emp_tok"])[1]
    assert api("POST", "/time-entries", {"project_id": pid, "work_date": "2027-04-01", "hours": 1},
               ctx["emp_tok"])[0] == 400
    assert api("GET", "/time-entries", token=ctx["emp_tok"],
               query={"project_id": pid, "from": "2026-01-01", "to": "2026-12-31"})[1]["total"] == 1
    assert api("DELETE", f"/time-entries/{entry['id']}", token=ctx["mgr_tok"])[0] == 204
    assert api("DELETE", f"/time-entries/{entry['id']}", token=ctx["mgr_tok"])[0] == 404


def test_expenses_list_and_delete(api, ctx):
    pid, tok = ctx["project"]["id"], ctx["mgr_tok"]
    exp = api("POST", f"/projects/{pid}/expenses", {"category": "software", "amount": 99,
                                                     "spent_on": "2026-02-02"}, tok)[1]
    assert api("POST", f"/projects/{pid}/expenses", {"category": "food", "amount": 1,
                                                      "spent_on": "2026-02-02"}, tok)[0] == 400
    assert api("POST", f"/projects/{pid}/expenses", {"category": "software", "amount": 1,
                                                      "spent_on": "2030-02-02"}, tok)[0] == 400
    listing = api("GET", f"/projects/{pid}/expenses", token=ctx["emp_tok"])[1]
    assert listing["spent"] >= 99 and listing["by_category"]
    assert api("DELETE", f"/expenses/{exp['id']}", token=tok)[0] == 204
    assert api("DELETE", f"/expenses/{exp['id']}", token=tok)[0] == 404


def test_archive_project_and_abandon(api, ctx):
    admin = ctx["admin"]
    p = api("POST", "/projects", {"name": "Doomed", "start_date": "2026-01-01", "end_date": "2026-02-01",
                                  "allocated_hours": 1, "manager_id": ctx["mgr"]["id"]}, admin)[1]
    assert api("POST", f"/projects/{p['id']}/restore", token=admin)[0] == 400
    assert api("DELETE", f"/projects/{p['id']}", token=admin)[0] == 204
    assert api("DELETE", f"/projects/{p['id']}", token=admin)[0] == 400
    assert api("GET", "/projects", token=admin, query={"include_archived": "true"})[1]["total"] >= 1
    api("POST", f"/projects/{p['id']}/restore", token=admin)
    assert api("POST", f"/projects/{p['id']}/status", {"status": "abandoned"}, admin)[1]["status"] == "abandoned"
