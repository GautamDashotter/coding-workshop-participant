"""Projects: CRUD, status changes, archive/restore, team assignment."""

from __future__ import annotations

from app import audit, db, rbac
from app.http import Request, bad_request, forbidden, not_found
from app.metrics import project_health
from app.validation import Field, check_date_order, page_params, validate

SCHEMA = {
    "name": Field("str", required=True, max_length=200),
    "description": Field("str", max_length=5000),
    "department": Field("str", max_length=150),
    "start_date": Field("date", required=True),
    "end_date": Field("date", required=True),
    "allocated_hours": Field("int", required=True, min_value=0, max_value=10_000_000),
    "budget": Field("decimal", min_value=0),
    "manager_id": Field("uuid", required=True),
}
PROJECT_SELECT = (
    "SELECT p.*, m.first_name || ' ' || m.last_name AS manager_name, "
    "COALESCE((SELECT sum(amount) FROM expenses e WHERE e.project_id = p.id), 0) AS budget_spent, "
    "COALESCE((SELECT sum(hours) FROM time_entries te WHERE te.project_id = p.id), 0) AS hours_logged, "
    "(SELECT count(*) FROM deliverables d WHERE d.project_id = p.id AND NOT d.is_archived) AS deliverables_total, "
    "(SELECT count(*) FROM deliverables d WHERE d.project_id = p.id AND NOT d.is_archived "
    "  AND d.status = 'completed') AS deliverables_done, "
    "(SELECT count(*) FROM deliverables d WHERE d.project_id = p.id AND NOT d.is_archived "
    "  AND d.status <> 'completed' AND d.end_date < CURRENT_DATE) AS deliverables_overdue "
    "FROM projects p JOIN users m ON m.id = p.manager_id"
)


def _with_health(rows: list[dict]) -> list[dict]:
    for row in rows:
        row["health"] = project_health(row)
    return rows


def _check_manager(manager_id: str) -> None:
    row = db.fetch_one("SELECT role FROM users WHERE id = %s AND NOT is_archived", (manager_id,))
    if not row or row["role"] not in ("manager", "admin"):
        raise bad_request("Project manager must be a manager or admin.",
                          {"fields": {"manager_id": "Choose a manager."}})


def list_projects(req: Request) -> tuple[int, dict]:
    """GET /projects?search=&status=&risk=&department=&include_archived=."""
    limit, offset = page_params(req.query)
    clause, params = rbac.visible_projects_clause(req.user)
    where = [clause]
    if not (rbac.is_admin(req.user) and req.query.get("include_archived") == "true"):
        where.append("NOT p.is_archived")
    if req.query.get("status"):
        where.append("p.status = %s")
        params.append(req.query["status"])
    if req.query.get("department"):
        where.append("p.department = %s")
        params.append(req.query["department"])
    if req.query.get("search"):
        where.append("(p.name ILIKE %s OR p.description ILIKE %s)")
        params += [f"%{req.query['search']}%"] * 2
    if req.query.get("manager_id"):
        where.append("p.manager_id = %s")
        params.append(req.query["manager_id"])
    rows = _with_health(db.fetch_all(
        f"{PROJECT_SELECT} WHERE {' AND '.join(where)} ORDER BY p.end_date, p.name", params))
    if req.query.get("risk"):
        rows = [r for r in rows if r["health"]["level"] == req.query["risk"]]
    return 200, {"items": rows[offset:offset + limit], "total": len(rows)}


def get_project(req: Request) -> tuple[int, dict]:
    """GET /projects/{id} with teams and permissions for the UI."""
    rbac.get_visible_project(req.user, req.path_params["id"])
    project = _with_health(db.fetch_all(f"{PROJECT_SELECT} WHERE p.id = %s", (req.path_params["id"],)))[0]
    project["teams"] = db.fetch_all(
        "SELECT t.id, t.name, t.department, pt.assigned_at FROM project_teams pt JOIN teams t ON t.id = pt.team_id "
        "WHERE pt.project_id = %s ORDER BY t.name", (project["id"],))
    project["can_manage"] = rbac.can_manage_project(req.user, project) and project["status"] == "active" \
        and not project["is_archived"]
    return 200, project


def create_project(req: Request) -> tuple[int, dict]:
    """POST /projects - admin only."""
    rbac.require_role(req.user, "admin")
    data = validate(req.body, SCHEMA)
    check_date_order(data["start_date"], data["end_date"])
    _check_manager(data["manager_id"])
    data["created_by"] = str(req.user["id"])
    cols = ", ".join(data)
    with db.transaction():
        row = db.execute(f"INSERT INTO projects ({cols}) VALUES ({', '.join(['%s'] * len(data))}) RETURNING *",
                         list(data.values()))
        audit.record(req.user, "create", "project", row["id"], None, row)
    req.path_params["id"] = str(row["id"])
    return 201, get_project(req)[1]


def update_project(req: Request) -> tuple[int, dict]:
    """PUT /projects/{id} - the project's manager or an admin. Only admins reassign the manager."""
    before = rbac.get_managed_project(req.user, req.path_params["id"])
    data = validate(req.body, SCHEMA, partial=True)
    if not data:
        raise bad_request("Nothing to update.")
    if "manager_id" in data and str(data["manager_id"]) != str(before["manager_id"]):
        if not rbac.is_admin(req.user):
            raise forbidden("Only admins can change a project's manager.")
        _check_manager(data["manager_id"])
    check_date_order(data.get("start_date", before["start_date"]), data.get("end_date", before["end_date"]))
    start, end = data.get("start_date", before["start_date"]), data.get("end_date", before["end_date"])
    outside = db.fetch_one("SELECT count(*) AS n FROM deliverables WHERE project_id = %s AND NOT is_archived "
                           "AND (start_date < %s OR end_date > %s)", (before["id"], start, end))
    if outside["n"]:
        raise bad_request(f"{outside['n']} deliverable(s) would fall outside the new dates. Adjust them first.")
    sets = ", ".join(f"{k} = %s" for k in data)
    with db.transaction():
        after = db.execute(f"UPDATE projects SET {sets}, updated_at = now() WHERE id = %s RETURNING *",
                           [*data.values(), before["id"]])
        audit.record(req.user, "update", "project", after["id"], before, after)
    return 200, get_project(req)[1]


def set_status(req: Request) -> tuple[int, dict]:
    """POST /projects/{id}/status {status}.

    completed: project manager or admin. abandoned: admin only.
    Both close the project, which also archives it (per spec).
    """
    data = validate(req.body, {"status": Field("str", required=True, choices=("completed", "abandoned"))})
    project = rbac.get_managed_project(req.user, req.path_params["id"])
    if data["status"] == "abandoned" and not rbac.is_admin(req.user):
        raise forbidden("Only admins can abandon a project.")
    if data["status"] == "completed":
        open_items = db.fetch_one("SELECT count(*) AS n FROM deliverables WHERE project_id = %s "
                                  "AND NOT is_archived AND status <> 'completed'", (project["id"],))
        if open_items["n"]:
            raise bad_request(f"Complete the {open_items['n']} open deliverable(s) before completing the project.")
    with db.transaction():
        after = db.execute("UPDATE projects SET status = %s, is_archived = TRUE, archived_at = now(), "
                           "updated_at = now() WHERE id = %s RETURNING *", (data["status"], project["id"]))
        action = "complete" if data["status"] == "completed" else "abandon"
        audit.record(req.user, action, "project", project["id"], project, after)
    return 200, after


def archive_project(req: Request) -> tuple[int, None]:
    """DELETE /projects/{id} - admin soft delete."""
    rbac.require_role(req.user, "admin")
    project = rbac.get_visible_project(req.user, req.path_params["id"])
    if project["is_archived"]:
        raise bad_request("Project is already archived.")
    with db.transaction():
        db.execute("UPDATE projects SET is_archived = TRUE, archived_at = now(), updated_at = now() WHERE id = %s",
                   (project["id"],))
        audit.record(req.user, "archive", "project", project["id"], {"is_archived": False}, {"is_archived": True})
    return 204, None


def restore_project(req: Request) -> tuple[int, dict]:
    """POST /projects/{id}/restore - admin; reopens as active."""
    rbac.require_role(req.user, "admin")
    project = rbac.get_visible_project(req.user, req.path_params["id"])
    if not project["is_archived"]:
        raise bad_request("Project is not archived.")
    with db.transaction():
        after = db.execute("UPDATE projects SET is_archived = FALSE, archived_at = NULL, status = 'active', "
                           "updated_at = now() WHERE id = %s RETURNING *", (project["id"],))
        audit.record(req.user, "restore", "project", project["id"], project, after)
    return 200, after


def assign_team(req: Request) -> tuple[int, dict]:
    """POST /projects/{id}/teams {team_id} - managers may assign only their own teams."""
    project = rbac.get_managed_project(req.user, req.path_params["id"])
    data = validate(req.body, {"team_id": Field("uuid", required=True)})
    team = db.fetch_one("SELECT * FROM teams WHERE id = %s AND NOT is_archived", (data["team_id"],))
    if not team:
        raise not_found("Team")
    if not rbac.is_admin(req.user) and str(team["manager_id"]) != str(req.user["id"]):
        raise forbidden("Managers can assign only teams they manage.")
    with db.transaction():
        row = db.execute("INSERT INTO project_teams (project_id, team_id, assigned_by) VALUES (%s, %s, %s) "
                         "RETURNING *", (project["id"], team["id"], req.user["id"]))
        audit.record(req.user, "assign_team", "project", project["id"], None, {"team_id": team["id"]})
    return 201, row


def unassign_team(req: Request) -> tuple[int, None]:
    """DELETE /projects/{id}/teams/{team_id}."""
    project = rbac.get_managed_project(req.user, req.path_params["id"])
    with db.transaction():
        row = db.execute("DELETE FROM project_teams WHERE project_id = %s AND team_id = %s RETURNING team_id",
                         (project["id"], req.path_params["team_id"]))
        if not row:
            raise not_found("Team assignment")
        audit.record(req.user, "assign_team", "project", project["id"], {"team_id": row["team_id"]}, None)
    return 204, None


def project_people(req: Request) -> tuple[int, dict]:
    """GET /projects/{id}/people - members of assigned teams (assigned_employees)."""
    project = rbac.get_visible_project(req.user, req.path_params["id"])
    rows = db.fetch_all(
        "SELECT DISTINCT u.id, u.first_name, u.last_name, u.job_title, u.role, t.name AS team_name "
        "FROM project_teams pt JOIN users u ON u.team_id = pt.team_id JOIN teams t ON t.id = u.team_id "
        "WHERE pt.project_id = %s AND NOT u.is_archived ORDER BY u.last_name", (project["id"],))
    return 200, {"items": rows, "total": len(rows)}
