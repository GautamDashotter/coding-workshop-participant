"""Login, session refresh and self-service profile."""

from __future__ import annotations

from app import audit, db
from app.auth import hash_password, issue_token, verify_password
from app.handlers.users import PUBLIC_FIELDS, serialize_user
from app.http import Request, bad_request, unauthorized
from app.validation import Field, validate

LOGIN_SCHEMA = {"login": Field("str", required=True), "password": Field("str", required=True)}
PROFILE_SCHEMA = {
    "first_name": Field("str", nullable=False, max_length=100),
    "last_name": Field("str", nullable=False, max_length=100),
    "email": Field("email", nullable=False),
    "profile_picture_url": Field("str", max_length=1000),
}


def login(req: Request) -> tuple[int, dict]:
    """POST /auth/login - accepts username or email."""
    data = validate(req.body, LOGIN_SCHEMA)
    user = db.fetch_one(
        "SELECT * FROM users WHERE (lower(email) = lower(%s) OR username = %s) AND NOT is_archived",
        (data["login"], data["login"]))
    if not user or not verify_password(data["password"], user["password_hash"]):
        raise unauthorized("Email/username or password is incorrect.", "invalid_credentials")
    with db.transaction():
        audit.record(user, "login", "user", user["id"])
    return 200, {**issue_token(user), "user": serialize_user(user, user)}


def refresh(req: Request) -> tuple[int, dict]:
    """POST /auth/refresh - swap a valid token for a fresh one."""
    return 200, issue_token(req.user)


def me(req: Request) -> tuple[int, dict]:
    """GET /auth/me - the signed-in user's profile."""
    user = db.fetch_one(f"SELECT {PUBLIC_FIELDS} FROM users WHERE id = %s", (req.user["id"],))
    return 200, serialize_user(user, req.user)


def update_me(req: Request) -> tuple[int, dict]:
    """PUT /auth/me - users may change only their own personal data."""
    data = validate(req.body, PROFILE_SCHEMA, partial=True)
    if not data:
        raise bad_request("Nothing to update.")
    before = db.fetch_one(f"SELECT {PUBLIC_FIELDS} FROM users WHERE id = %s", (req.user["id"],))
    sets = ", ".join(f"{k} = %s" for k in data)
    with db.transaction():
        after = db.execute(f"UPDATE users SET {sets}, updated_at = now() WHERE id = %s RETURNING {PUBLIC_FIELDS}",
                           [*data.values(), req.user["id"]])
        audit.record(req.user, "update", "user", req.user["id"], before, after)
    return 200, serialize_user(after, req.user)


def change_password(req: Request) -> tuple[int, dict]:
    """POST /auth/password - requires the current password."""
    data = validate(req.body, {"current_password": Field("str", required=True),
                               "new_password": Field("str", required=True, max_length=200)})
    if len(data["new_password"]) < 8:
        raise bad_request("Password too short.", {"fields": {"new_password": "Use at least 8 characters."}})
    row = db.fetch_one("SELECT password_hash FROM users WHERE id = %s", (req.user["id"],))
    if not verify_password(data["current_password"], row["password_hash"]):
        raise bad_request("Current password is incorrect.", {"fields": {"current_password": "Incorrect password."}})
    with db.transaction():
        db.execute("UPDATE users SET password_hash = %s, updated_at = now() WHERE id = %s",
                   (hash_password(data["new_password"]), req.user["id"]))
        audit.record(req.user, "update", "user", req.user["id"], {"password": "***"}, {"password": "changed"})
    return 200, {"message": "Password changed."}
