"""Deliverables (milestones), their assignees and dependency chain."""

from __future__ import annotations

from app import audit, db, rbac
from app.http import Request, bad_request, conflict, forbidden, not_found
from app.metrics import topological_order
from app.validation import Field, check_date_order, check_within, validate

SCHEMA = {
    "name": Field("str", required=True, max_length=200),
    "goal": Field("str", max_length=2000),
    "deliverables": Field("str", max_length=5000),
    "start_date": Field("date", required=True),
    "end_date": Field("date", required=True),
    "status": Field("str", choices=("planned", "in_progress")),
    "assignee_ids": Field("uuid_list"),
}
SELECT = (
    "SELECT d.*, "
    "COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.first_name || ' ' || u.last_name)) "
    "  FROM deliverable_assignees da JOIN users u ON u.id = da.user_id WHERE da.deliverable_id = d.id), '[]') "
    "  AS assignees, "
    "COALESCE((SELECT json_agg(dd.depends_on_id) FROM deliverable_dependencies dd "
    "  WHERE dd.deliverable_id = d.id), '[]') AS depends_on, "
    "COALESCE((SELECT sum(hours) FROM time_entries te WHERE te.deliverable_id = d.id), 0) AS hours_logged "
    "FROM deliverables d"
)


def _load(user: dict, deliverable_id: str) -> tuple[dict, dict]:
    row = db.fetch_one("SELECT * FROM deliverables WHERE id = %s AND NOT is_archived", (deliverable_id,))
    if not row:
        raise not_found("Deliverable")
    project = rbac.get_visible_project(user, str(row["project_id"]))
    return row, project


def _set_assignees(deliverable_id, project_id, user_ids: list[str]) -> None:
    if user_ids:
        valid = db.fetch_all(
            "SELECT u.id FROM users u JOIN project_teams pt ON pt.team_id = u.team_id "
            "WHERE pt.project_id = %s AND u.id = ANY(%s::uuid[]) AND NOT u.is_archived", (project_id, user_ids))
        if len(valid) != len(set(user_ids)):
            raise bad_request("Assignees must be members of a team assigned to this project.",
                              {"fields": {"assignee_ids": "Includes someone outside the project teams."}})
    db.execute("DELETE FROM deliverable_assignees WHERE deliverable_id = %s", (deliverable_id,))
    for uid in set(user_ids):
        db.execute("INSERT INTO deliverable_assignees (deliverable_id, user_id) VALUES (%s, %s)",
                   (deliverable_id, uid))


def list_deliverables(req: Request) -> tuple[int, dict]:
    """GET /projects/{id}/deliverables?status=&search=."""
    project = rbac.get_visible_project(req.user, req.path_params["id"])
    where, params = ["d.project_id = %s", "NOT d.is_archived"], [project["id"]]
    if req.query.get("status"):
        where.append("d.status = %s")
        params.append(req.query["status"])
    if req.query.get("search"):
        where.append("(d.name ILIKE %s OR d.goal ILIKE %s)")
        params += [f"%{req.query['search']}%"] * 2
    rows = db.fetch_all(f"{SELECT} WHERE {' AND '.join(where)} ORDER BY d.seq_no", params)
    return 200, {"items": rows, "total": len(rows)}


def get_deliverable(req: Request) -> tuple[int, dict]:
    """GET /deliverables/{id}."""
    row, _ = _load(req.user, req.path_params["id"])
    return 200, db.fetch_one(f"{SELECT} WHERE d.id = %s", (row["id"],))


def create_deliverable(req: Request) -> tuple[int, dict]:
    """POST /projects/{id}/deliverables - sequential number assigned per project."""
    project = rbac.get_managed_project(req.user, req.path_params["id"])
    data = validate(req.body, SCHEMA)
    check_date_order(data["start_date"], data["end_date"], strict=False)
    check_within(data["start_date"], data["end_date"], project["start_date"], project["end_date"], "Deliverable")
    assignees = data.pop("assignee_ids", None) or []
    with db.transaction() as conn:
        conn.execute("SELECT 1 FROM projects WHERE id = %s FOR UPDATE", (project["id"],))
        seq = db.fetch_one("SELECT COALESCE(max(seq_no), 0) + 1 AS n FROM deliverables WHERE project_id = %s",
                           (project["id"],))["n"]
        row = db.execute(
            "INSERT INTO deliverables (project_id, seq_no, name, goal, deliverables, start_date, end_date, status) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
            (project["id"], seq, data["name"], data.get("goal"), data.get("deliverables"),
             data["start_date"], data["end_date"], data.get("status", "planned")))
        _set_assignees(row["id"], project["id"], assignees)
        audit.record(req.user, "create", "deliverable", row["id"], None, row)
    return 201, db.fetch_one(f"{SELECT} WHERE d.id = %s", (row["id"],))


def update_deliverable(req: Request) -> tuple[int, dict]:
    """PUT /deliverables/{id}."""
    before, project = _load(req.user, req.path_params["id"])
    rbac.get_managed_project(req.user, str(project["id"]))
    if before["status"] == "completed":
        raise forbidden("Completed deliverables are read-only.")
    data = validate(req.body, SCHEMA, partial=True)
    start, end = data.get("start_date", before["start_date"]), data.get("end_date", before["end_date"])
    check_date_order(start, end, strict=False)
    check_within(start, end, project["start_date"], project["end_date"], "Deliverable")
    assignees = data.pop("assignee_ids", None)
    with db.transaction():
        after = before
        if data:
            sets = ", ".join(f"{k} = %s" for k in data)
            after = db.execute(f"UPDATE deliverables SET {sets}, updated_at = now() WHERE id = %s RETURNING *",
                               [*data.values(), before["id"]])
        if assignees is not None:
            _set_assignees(before["id"], project["id"], assignees)
        audit.record(req.user, "update", "deliverable", before["id"], before,
                     {**after, **({"assignee_ids": assignees} if assignees is not None else {})})
    return 200, db.fetch_one(f"{SELECT} WHERE d.id = %s", (before["id"],))


def complete_deliverable(req: Request) -> tuple[int, dict]:
    """POST /deliverables/{id}/complete - blocked until dependencies are completed."""
    before, project = _load(req.user, req.path_params["id"])
    rbac.get_managed_project(req.user, str(project["id"]))
    if before["status"] == "completed":
        raise bad_request("Deliverable is already completed.")
    blockers = db.fetch_all(
        "SELECT d.seq_no, d.name FROM deliverable_dependencies dd JOIN deliverables d ON d.id = dd.depends_on_id "
        "WHERE dd.deliverable_id = %s AND d.status <> 'completed'", (before["id"],))
    if blockers:
        names = ", ".join(f"#{b['seq_no']} {b['name']}" for b in blockers)
        raise conflict(f"Finish its dependencies first: {names}.")
    with db.transaction():
        after = db.execute("UPDATE deliverables SET status = 'completed', completed_at = now(), updated_at = now() "
                           "WHERE id = %s RETURNING *", (before["id"],))
        audit.record(req.user, "complete", "deliverable", before["id"], before, after)
    return 200, db.fetch_one(f"{SELECT} WHERE d.id = %s", (before["id"],))


def archive_deliverable(req: Request) -> tuple[int, None]:
    """DELETE /deliverables/{id} - soft delete; removes its dependency links."""
    before, project = _load(req.user, req.path_params["id"])
    rbac.get_managed_project(req.user, str(project["id"]))
    with db.transaction():
        db.execute("DELETE FROM deliverable_dependencies WHERE deliverable_id = %s OR depends_on_id = %s",
                   (before["id"], before["id"]))
        db.execute("UPDATE deliverables SET is_archived = TRUE, archived_at = now() WHERE id = %s", (before["id"],))
        audit.record(req.user, "archive", "deliverable", before["id"], {"is_archived": False}, {"is_archived": True})
    return 204, None


def add_dependency(req: Request) -> tuple[int, dict]:
    """POST /deliverables/{id}/dependencies {depends_on_id} - same project, no cycles."""
    deliverable, project = _load(req.user, req.path_params["id"])
    rbac.get_managed_project(req.user, str(project["id"]))
    data = validate(req.body, {"depends_on_id": Field("uuid", required=True)})
    dep = db.fetch_one("SELECT * FROM deliverables WHERE id = %s AND NOT is_archived", (data["depends_on_id"],))
    if not dep or dep["project_id"] != deliverable["project_id"]:
        raise bad_request("A deliverable can only depend on another deliverable in the same project.")
    if dep["id"] == deliverable["id"]:
        raise bad_request("A deliverable cannot depend on itself.")
    # Would the new edge close a loop? Walk from dep through its dependencies.
    cycle = db.fetch_one(
        "WITH RECURSIVE chain(id) AS (SELECT %s::uuid UNION "
        "SELECT dd.depends_on_id FROM deliverable_dependencies dd JOIN chain c ON dd.deliverable_id = c.id) "
        "SELECT 1 FROM chain WHERE id = %s", (dep["id"], deliverable["id"]))
    if cycle:
        raise conflict("That dependency would create a loop in the chain.")
    with db.transaction():
        db.execute("INSERT INTO deliverable_dependencies (deliverable_id, depends_on_id) VALUES (%s, %s)",
                   (deliverable["id"], dep["id"]))
        audit.record(req.user, "update", "deliverable", deliverable["id"], None, {"depends_on": dep["id"]})
    return 201, {"deliverable_id": deliverable["id"], "depends_on_id": dep["id"]}


def remove_dependency(req: Request) -> tuple[int, None]:
    """DELETE /deliverables/{id}/dependencies/{dep_id}."""
    deliverable, project = _load(req.user, req.path_params["id"])
    rbac.get_managed_project(req.user, str(project["id"]))
    with db.transaction():
        row = db.execute("DELETE FROM deliverable_dependencies WHERE deliverable_id = %s AND depends_on_id = %s "
                         "RETURNING depends_on_id", (deliverable["id"], req.path_params["dep_id"]))
        if not row:
            raise not_found("Dependency")
        audit.record(req.user, "update", "deliverable", deliverable["id"], {"depends_on": row["depends_on_id"]}, None)
    return 204, None


def dependency_graph(req: Request) -> tuple[int, dict]:
    """GET /projects/{id}/dependency-graph - nodes, edges, order and what is blocked."""
    project = rbac.get_visible_project(req.user, req.path_params["id"])
    nodes = db.fetch_all("SELECT id, seq_no, name, status, start_date, end_date FROM deliverables "
                         "WHERE project_id = %s AND NOT is_archived ORDER BY seq_no", (project["id"],))
    edges = db.fetch_all("SELECT dd.deliverable_id, dd.depends_on_id FROM deliverable_dependencies dd "
                         "JOIN deliverables d ON d.id = dd.deliverable_id WHERE d.project_id = %s", (project["id"],))
    status = {str(n["id"]): n["status"] for n in nodes}
    order = topological_order([str(n["id"]) for n in nodes],
                              [(str(e["deliverable_id"]), str(e["depends_on_id"])) for e in edges])
    blocked = sorted({str(e["deliverable_id"]) for e in edges
                      if status.get(str(e["depends_on_id"])) != "completed"
                      and status.get(str(e["deliverable_id"])) != "completed"})
    return 200, {"nodes": nodes, "edges": edges, "order": order, "blocked": blocked}
