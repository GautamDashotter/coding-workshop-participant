"""Time tracking: actual hours worked."""

from __future__ import annotations

from app import audit, db, rbac
from app.http import Request, bad_request, forbidden, not_found
from app.validation import Field, validate

SCHEMA = {
    "project_id": Field("uuid", required=True),
    "deliverable_id": Field("uuid"),
    "work_date": Field("date", required=True),
    "hours": Field("decimal", required=True, min_value=0.25, max_value=24),
    "note": Field("str", max_length=1000),
}
SELECT = (
    "SELECT te.*, u.first_name || ' ' || u.last_name AS user_name, p.name AS project_name, "
    "d.name AS deliverable_name FROM time_entries te JOIN users u ON u.id = te.user_id "
    "JOIN projects p ON p.id = te.project_id LEFT JOIN deliverables d ON d.id = te.deliverable_id"
)


def list_entries(req: Request) -> tuple[int, dict]:
    """GET /time-entries?project_id=&user_id=&from=&to= - employees see their own."""
    clause, params = rbac.visible_projects_clause(req.user)
    where = [clause]
    if req.user["role"] == "employee":
        where.append("te.user_id = %s")
        params.append(req.user["id"])
    for key in ("project_id", "user_id"):
        if req.query.get(key):
            where.append(f"te.{key} = %s")
            params.append(req.query[key])
    if req.query.get("from"):
        where.append("te.work_date >= %s")
        params.append(req.query["from"])
    if req.query.get("to"):
        where.append("te.work_date <= %s")
        params.append(req.query["to"])
    rows = db.fetch_all(f"{SELECT} WHERE {' AND '.join(where)} ORDER BY te.work_date DESC LIMIT 500", params)
    return 200, {"items": rows, "total": len(rows)}


def create_entry(req: Request) -> tuple[int, dict]:
    """POST /time-entries - anyone logs their own time on projects they can see."""
    data = validate(req.body, SCHEMA)
    project = rbac.get_visible_project(req.user, data["project_id"])
    if project["status"] != "active" or project["is_archived"]:
        raise forbidden("Time can only be logged on active projects.")
    if not project["start_date"] <= data["work_date"] <= project["end_date"]:
        raise bad_request("Work date must fall within the project dates.",
                          {"fields": {"work_date": "Outside project dates."}})
    if data.get("deliverable_id") and not db.fetch_one(
            "SELECT 1 FROM deliverables WHERE id = %s AND project_id = %s", (data["deliverable_id"], project["id"])):
        raise bad_request("Deliverable is not part of this project.", {"fields": {"deliverable_id": "Wrong project."}})
    day_total = db.fetch_one("SELECT COALESCE(sum(hours), 0) AS h FROM time_entries WHERE user_id = %s "
                             "AND work_date = %s", (req.user["id"], data["work_date"]))["h"]
    if day_total + data["hours"] > 24:
        raise bad_request("A day has only 24 hours.", {"fields": {"hours": f"{day_total} already logged that day."}})
    data["user_id"] = str(req.user["id"])
    with db.transaction():
        row = db.execute(
            f"INSERT INTO time_entries ({', '.join(data)}) VALUES ({', '.join(['%s'] * len(data))}) RETURNING *",
            list(data.values()))
        audit.record(req.user, "create", "time_entry", row["id"], None, row)
    return 201, db.fetch_one(f"{SELECT} WHERE te.id = %s", (row["id"],))


def delete_entry(req: Request) -> tuple[int, None]:
    """DELETE /time-entries/{id} - the author, the project manager, or an admin."""
    entry = db.fetch_one("SELECT * FROM time_entries WHERE id = %s", (req.path_params["id"],))
    if not entry:
        raise not_found("Time entry")
    project = rbac.get_visible_project(req.user, str(entry["project_id"]))
    if str(entry["user_id"]) != str(req.user["id"]) and not rbac.can_manage_project(req.user, project):
        raise forbidden("You can delete only your own time entries.")
    with db.transaction():
        db.execute("DELETE FROM time_entries WHERE id = %s", (entry["id"],))
        audit.record(req.user, "archive", "time_entry", entry["id"], entry, None)
    return 204, None
