"""Teams: managers create and edit their own teams; admins manage all."""

from __future__ import annotations

from app import audit, db, rbac
from app.http import Request, bad_request, forbidden, not_found
from app.validation import Field, validate

SCHEMA = {
    "name": Field("str", required=True, max_length=150),
    "department": Field("str", max_length=150),
    "manager_id": Field("uuid"),
}
TEAM_SELECT = (
    "SELECT t.*, m.first_name || ' ' || m.last_name AS manager_name, "
    "(SELECT count(*) FROM users u WHERE u.team_id = t.id AND NOT u.is_archived) AS member_count "
    "FROM teams t LEFT JOIN users m ON m.id = t.manager_id"
)


def _check_manager(manager_id: str) -> None:
    row = db.fetch_one("SELECT role FROM users WHERE id = %s AND NOT is_archived", (manager_id,))
    if not row or row["role"] not in ("manager", "admin"):
        raise bad_request("Team manager must be a manager or admin.", {"fields": {"manager_id": "Choose a manager."}})


def _load(team_id: str) -> dict:
    team = db.fetch_one(f"{TEAM_SELECT} WHERE t.id = %s", (team_id,))
    if not team:
        raise not_found("Team")
    return team


def _require_owner(user: dict, team: dict) -> None:
    if not rbac.is_admin(user) and str(team["manager_id"]) != str(user["id"]):
        raise forbidden("Only this team's manager or an admin can change it.")


def list_teams(req: Request) -> tuple[int, dict]:
    """GET /teams?search=&mine=true - any signed-in user."""
    where, params = ["NOT t.is_archived"], []
    if rbac.is_admin(req.user) and req.query.get("include_archived") == "true":
        where = ["TRUE"]
    if req.query.get("search"):
        where.append("(t.name ILIKE %s OR t.department ILIKE %s)")
        params += [f"%{req.query['search']}%"] * 2
    if req.query.get("mine") == "true":
        where.append("t.manager_id = %s")
        params.append(req.user["id"])
    rows = db.fetch_all(f"{TEAM_SELECT} WHERE {' AND '.join(where)} ORDER BY t.name", params)
    return 200, {"items": rows, "total": len(rows)}


def get_team(req: Request) -> tuple[int, dict]:
    """GET /teams/{id} with members."""
    team = _load(req.path_params["id"])
    team["members"] = db.fetch_all(
        "SELECT id, username, first_name, last_name, email, role, job_title FROM users "
        "WHERE team_id = %s AND NOT is_archived ORDER BY last_name", (team["id"],))
    return 200, team


def create_team(req: Request) -> tuple[int, dict]:
    """POST /teams (manager+). Managers become the team's manager."""
    rbac.require_role(req.user, "manager")
    data = validate(req.body, SCHEMA)
    if not rbac.is_admin(req.user) or not data.get("manager_id"):
        data["manager_id"] = str(req.user["id"])
    _check_manager(data["manager_id"])
    with db.transaction():
        row = db.execute("INSERT INTO teams (name, department, manager_id) VALUES (%s, %s, %s) RETURNING *",
                         (data["name"], data.get("department"), data["manager_id"]))
        audit.record(req.user, "create", "team", row["id"], None, row)
    return 201, _load(row["id"])


def update_team(req: Request) -> tuple[int, dict]:
    """PUT /teams/{id} - owner manager or admin. Only admins reassign managers."""
    rbac.require_role(req.user, "manager")
    before = _load(req.path_params["id"])
    _require_owner(req.user, before)
    data = validate(req.body, SCHEMA, partial=True)
    if "manager_id" in data and not rbac.is_admin(req.user):
        raise forbidden("Only admins can change a team's manager.")
    if data.get("manager_id"):
        _check_manager(data["manager_id"])
    if not data:
        raise bad_request("Nothing to update.")
    sets = ", ".join(f"{k} = %s" for k in data)
    with db.transaction():
        after = db.execute(f"UPDATE teams SET {sets}, updated_at = now() WHERE id = %s RETURNING *",
                           [*data.values(), before["id"]])
        audit.record(req.user, "update", "team", after["id"], before, after)
    return 200, _load(after["id"])


def archive_team(req: Request) -> tuple[int, None]:
    """DELETE /teams/{id} - admin only; blocked while members remain."""
    rbac.require_role(req.user, "admin")
    team = _load(req.path_params["id"])
    if team["member_count"]:
        raise bad_request("Move this team's members to another team before archiving it.")
    with db.transaction():
        db.execute("UPDATE teams SET is_archived = TRUE, archived_at = now() WHERE id = %s", (team["id"],))
        audit.record(req.user, "archive", "team", team["id"], {"is_archived": False}, {"is_archived": True})
    return 204, None
