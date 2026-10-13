"""Resource allocation: planned share of each person's time per project."""

from __future__ import annotations

from app import audit, db, rbac
from app.http import Request, bad_request, not_found
from app.validation import Field, check_date_order, check_within, validate

SCHEMA = {
    "project_id": Field("uuid", required=True),
    "user_id": Field("uuid", required=True),
    "allocation_percent": Field("int", required=True, min_value=1, max_value=100),
    "start_date": Field("date", required=True),
    "end_date": Field("date", required=True),
    "role_on_project": Field("str", max_length=150),
}
SELECT = (
    "SELECT a.*, u.first_name || ' ' || u.last_name AS user_name, p.name AS project_name "
    "FROM allocations a JOIN users u ON u.id = a.user_id JOIN projects p ON p.id = a.project_id"
)


def _overlap_total(user_id, start, end, exclude_id=None) -> int:
    row = db.fetch_one(
        "SELECT COALESCE(max(total), 0) AS peak FROM ("
        "  SELECT sum(a.allocation_percent) AS total FROM generate_series(%s::date, %s::date, '1 day') AS day "
        "  JOIN allocations a ON day BETWEEN a.start_date AND a.end_date "
        "  JOIN projects p ON p.id = a.project_id AND p.status = 'active' AND NOT p.is_archived "
        "  WHERE a.user_id = %s AND (%s::uuid IS NULL OR a.id <> %s::uuid) GROUP BY day) s",
        (start, end, user_id, exclude_id, exclude_id))
    return int(row["peak"])


def _validate_for_project(data: dict, project: dict) -> None:
    check_date_order(data["start_date"], data["end_date"], strict=False)
    check_within(data["start_date"], data["end_date"], project["start_date"], project["end_date"], "Allocation")
    member = db.fetch_one(
        "SELECT 1 FROM users u JOIN project_teams pt ON pt.team_id = u.team_id "
        "WHERE u.id = %s AND pt.project_id = %s AND NOT u.is_archived", (data["user_id"], project["id"]))
    if not member:
        raise bad_request("Only members of teams assigned to this project can be allocated.",
                          {"fields": {"user_id": "Not on a team assigned to this project."}})


def list_allocations(req: Request) -> tuple[int, dict]:
    """GET /allocations?project_id=&user_id= - limited to visible projects."""
    clause, params = rbac.visible_projects_clause(req.user)
    where = [clause]
    if req.user["role"] == "employee" and not req.query.get("project_id"):
        where.append("a.user_id = %s")
        params.append(req.user["id"])
    for key in ("project_id", "user_id"):
        if req.query.get(key):
            where.append(f"a.{key} = %s")
            params.append(req.query[key])
    rows = db.fetch_all(f"{SELECT} WHERE {' AND '.join(where)} ORDER BY a.start_date", params)
    return 200, {"items": rows, "total": len(rows)}


def create_allocation(req: Request) -> tuple[int, dict]:
    """POST /allocations - returns a warning when the person ends up over 100%."""
    data = validate(req.body, SCHEMA)
    project = rbac.get_managed_project(req.user, data["project_id"])
    _validate_for_project(data, project)
    with db.transaction():
        row = db.execute(
            f"INSERT INTO allocations ({', '.join(data)}) VALUES ({', '.join(['%s'] * len(data))}) RETURNING *",
            list(data.values()))
        audit.record(req.user, "create", "allocation", row["id"], None, row)
    peak = _overlap_total(data["user_id"], data["start_date"], data["end_date"])
    result = db.fetch_one(f"{SELECT} WHERE a.id = %s", (row["id"],))
    result["warning"] = (f"This person is now allocated {peak}% at peak during this period."
                         if peak > 100 else None)
    return 201, result


def update_allocation(req: Request) -> tuple[int, dict]:
    """PUT /allocations/{id}."""
    before = db.fetch_one("SELECT * FROM allocations WHERE id = %s", (req.path_params["id"],))
    if not before:
        raise not_found("Allocation")
    project = rbac.get_managed_project(req.user, str(before["project_id"]))
    data = validate(req.body, {k: v for k, v in SCHEMA.items() if k not in ("project_id", "user_id")}, partial=True)
    if not data:
        raise bad_request("Nothing to update.")
    merged = {**before, **data, "user_id": str(before["user_id"])}
    _validate_for_project(merged, project)
    sets = ", ".join(f"{k} = %s" for k in data)
    with db.transaction():
        after = db.execute(f"UPDATE allocations SET {sets}, updated_at = now() WHERE id = %s RETURNING *",
                           [*data.values(), before["id"]])
        audit.record(req.user, "update", "allocation", before["id"], before, after)
    peak = _overlap_total(before["user_id"], merged["start_date"], merged["end_date"])
    result = db.fetch_one(f"{SELECT} WHERE a.id = %s", (before["id"],))
    result["warning"] = (f"This person is now allocated {peak}% at peak during this period."
                         if peak > 100 else None)
    return 200, result


def delete_allocation(req: Request) -> tuple[int, None]:
    """DELETE /allocations/{id} - plans are not history, so this is a hard delete (audited)."""
    before = db.fetch_one("SELECT * FROM allocations WHERE id = %s", (req.path_params["id"],))
    if not before:
        raise not_found("Allocation")
    rbac.get_managed_project(req.user, str(before["project_id"]))
    with db.transaction():
        db.execute("DELETE FROM allocations WHERE id = %s", (before["id"],))
        audit.record(req.user, "archive", "allocation", before["id"], before, None)
    return 204, None
