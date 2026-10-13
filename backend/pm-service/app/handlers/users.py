"""User management (admin) and the people directory."""

from __future__ import annotations

import secrets
import string

from app import audit, db, rbac
from app.auth import hash_password
from app.http import Request, bad_request, forbidden, not_found
from app.validation import Field, page_params, validate

PUBLIC_FIELDS = ("id, username, first_name, last_name, email, role, job_title, salary, "
                 "profile_picture_url, team_id, is_archived, archived_at, created_at, updated_at")
ROLES = ("admin", "manager", "employee")

CREATE_SCHEMA = {
    "first_name": Field("str", required=True, max_length=100),
    "last_name": Field("str", required=True, max_length=100),
    "email": Field("email", required=True),
    "password": Field("str", required=True, max_length=200),
    "role": Field("str", choices=ROLES),
    "job_title": Field("str", max_length=150),
    "salary": Field("decimal", min_value=0),
    "profile_picture_url": Field("str", max_length=1000),
    "team_id": Field("uuid"),
}
UPDATE_SCHEMA = {k: v for k, v in CREATE_SCHEMA.items() if k != "password"}


def serialize_user(user: dict, viewer: dict) -> dict:
    """Strip secrets; salary is visible to admins only."""
    out = {k: v for k, v in user.items() if k != "password_hash"}
    if not rbac.is_admin(viewer):
        out.pop("salary", None)
    return out


def _generate_username() -> str:
    alphabet = string.ascii_lowercase + string.digits
    for _ in range(20):
        candidate = "".join(secrets.choice(alphabet) for _ in range(6))
        if not db.fetch_one("SELECT 1 FROM users WHERE username = %s", (candidate,)):
            return candidate
    raise RuntimeError("Could not generate a unique username.")


def _check_team(role: str, team_id: str | None) -> None:
    if role == "employee" and not team_id:
        raise bad_request("Employees must belong to a team.", {"fields": {"team_id": "Choose a team."}})
    if team_id and not db.fetch_one("SELECT 1 FROM teams WHERE id = %s AND NOT is_archived", (team_id,)):
        raise bad_request("Team does not exist.", {"fields": {"team_id": "Choose an existing team."}})


def list_users(req: Request) -> tuple[int, dict]:
    """GET /users?search=&role=&team_id=&include_archived= (manager+)."""
    rbac.require_role(req.user, "manager")
    limit, offset = page_params(req.query)
    where, params = ["TRUE"], []
    if not (rbac.is_admin(req.user) and req.query.get("include_archived") == "true"):
        where.append("NOT u.is_archived")
    if req.query.get("search"):
        where.append("(u.first_name ILIKE %s OR u.last_name ILIKE %s OR u.email ILIKE %s OR u.username ILIKE %s "
                     "OR u.job_title ILIKE %s)")
        params += [f"%{req.query['search']}%"] * 5
    if req.query.get("role"):
        where.append("u.role = %s")
        params.append(req.query["role"])
    if req.query.get("team_id"):
        where.append("u.team_id = %s")
        params.append(req.query["team_id"])
    rows = db.fetch_all(
        f"SELECT {', '.join('u.' + f.strip() for f in PUBLIC_FIELDS.split(','))}, t.name AS team_name, "
        "count(*) OVER () AS total FROM users u LEFT JOIN teams t ON t.id = u.team_id "
        f"WHERE {' AND '.join(where)} ORDER BY u.last_name, u.first_name LIMIT %s OFFSET %s",
        [*params, limit, offset])
    total = rows[0]["total"] if rows else 0
    return 200, {"items": [serialize_user({k: v for k, v in r.items() if k != "total"}, req.user) for r in rows],
                 "total": total}


def get_user(req: Request) -> tuple[int, dict]:
    """GET /users/{id} - self, or manager+."""
    if str(req.user["id"]) != req.path_params["id"]:
        rbac.require_role(req.user, "manager")
    user = db.fetch_one(f"SELECT {PUBLIC_FIELDS} FROM users WHERE id = %s", (req.path_params["id"],))
    if not user or (user["is_archived"] and not rbac.is_admin(req.user)):
        raise not_found("User")
    return 200, serialize_user(user, req.user)


def create_user(req: Request) -> tuple[int, dict]:
    """POST /users - admin only; username is generated."""
    rbac.require_role(req.user, "admin")
    data = validate(req.body, CREATE_SCHEMA)
    data.setdefault("role", "employee")
    if len(data["password"]) < 8:
        raise bad_request("Password too short.", {"fields": {"password": "Use at least 8 characters."}})
    _check_team(data["role"], data.get("team_id"))
    password = data.pop("password")
    data["username"] = _generate_username()
    data["password_hash"] = hash_password(password)
    cols = ", ".join(data)
    with db.transaction():
        user = db.execute(f"INSERT INTO users ({cols}) VALUES ({', '.join(['%s'] * len(data))}) "
                          f"RETURNING {PUBLIC_FIELDS}", list(data.values()))
        audit.record(req.user, "create", "user", user["id"], None, user)
    return 201, serialize_user(user, req.user)


def update_user(req: Request) -> tuple[int, dict]:
    """PUT /users/{id} - admin only (users edit themselves via /auth/me)."""
    rbac.require_role(req.user, "admin")
    data = validate(req.body, UPDATE_SCHEMA, partial=True)
    before = db.fetch_one(f"SELECT {PUBLIC_FIELDS} FROM users WHERE id = %s", (req.path_params["id"],))
    if not before:
        raise not_found("User")
    if not data:
        raise bad_request("Nothing to update.")
    if str(before["id"]) == str(req.user["id"]) and data.get("role", "admin") != "admin":
        raise forbidden("You cannot remove your own admin role.")
    role = data.get("role", before["role"])
    team_id = data["team_id"] if "team_id" in data else before["team_id"]
    _check_team(role, team_id)
    sets = ", ".join(f"{k} = %s" for k in data)
    with db.transaction():
        after = db.execute(f"UPDATE users SET {sets}, updated_at = now() WHERE id = %s RETURNING {PUBLIC_FIELDS}",
                           [*data.values(), req.path_params["id"]])
        if "role" in data and data["role"] != before["role"]:
            audit.record(req.user, "assign_role", "user", after["id"], {"role": before["role"]},
                         {"role": after["role"]})
        if "team_id" in data and data["team_id"] != (str(before["team_id"]) if before["team_id"] else None):
            audit.record(req.user, "assign_team", "user", after["id"], {"team_id": before["team_id"]},
                         {"team_id": after["team_id"]})
        audit.record(req.user, "update", "user", after["id"], before, after)
    return 200, serialize_user(after, req.user)


def archive_user(req: Request) -> tuple[int, None]:
    """DELETE /users/{id} - soft delete (admin)."""
    rbac.require_role(req.user, "admin")
    if req.path_params["id"] == str(req.user["id"]):
        raise forbidden("You cannot archive your own account.")
    with db.transaction():
        row = db.execute("UPDATE users SET is_archived = TRUE, archived_at = now(), updated_at = now() "
                         "WHERE id = %s AND NOT is_archived RETURNING id", (req.path_params["id"],))
        if not row:
            raise not_found("User")
        audit.record(req.user, "archive", "user", row["id"], {"is_archived": False}, {"is_archived": True})
    return 204, None


def restore_user(req: Request) -> tuple[int, dict]:
    """POST /users/{id}/restore (admin)."""
    rbac.require_role(req.user, "admin")
    with db.transaction():
        row = db.execute(f"UPDATE users SET is_archived = FALSE, archived_at = NULL, updated_at = now() "
                         f"WHERE id = %s AND is_archived RETURNING {PUBLIC_FIELDS}", (req.path_params["id"],))
        if not row:
            raise not_found("Archived user")
        audit.record(req.user, "restore", "user", row["id"], {"is_archived": True}, {"is_archived": False})
    return 200, serialize_user(row, req.user)
