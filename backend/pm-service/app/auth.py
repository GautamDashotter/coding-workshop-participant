"""Authentication: password hashing (PBKDF2) and JWT tokens.

Uses only the standard library for hashing so the Lambda package has no
compiled dependencies beyond psycopg.
"""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import os
import secrets

import jwt

from app import db
from app.http import Request, unauthorized

TOKEN_TTL = dt.timedelta(hours=8)
_PBKDF2_ROUNDS = 240_000


def _secret() -> str:
    explicit = os.getenv("JWT_SECRET")
    if explicit:
        return explicit
    # Derived per environment so tokens are not portable between deployments.
    seed = f"{os.getenv('APP_NAME', 'local')}:{os.getenv('POSTGRES_PASS', 'postgres123')}"
    return hashlib.sha256(seed.encode()).hexdigest()


def hash_password(password: str) -> str:
    """Hash a password as pbkdf2$rounds$salt$hash."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return "pbkdf2${}${}${}".format(
        _PBKDF2_ROUNDS, base64.b64encode(salt).decode(), base64.b64encode(digest).decode())


def verify_password(password: str, stored: str) -> bool:
    """Constant-time comparison against a stored hash."""
    try:
        _, rounds, salt_b64, hash_b64 = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), int(rounds))
        return hmac.compare_digest(digest, base64.b64decode(hash_b64))
    except (ValueError, TypeError):
        return False


def issue_token(user: dict) -> dict:
    """Create a signed access token for a user."""
    now = dt.datetime.now(dt.timezone.utc)
    expires = now + TOKEN_TTL
    payload = {"sub": str(user["id"]), "role": user["role"], "iat": now, "exp": expires}
    return {"token": jwt.encode(payload, _secret(), algorithm="HS256"), "expires_at": expires.isoformat()}


def _extract_token(req: Request) -> str | None:
    # X-Auth-Token is used because the local proxy and CloudFront both pass it
    # through reliably; Authorization: Bearer is accepted too.
    token = req.headers.get("x-auth-token")
    if token:
        return token
    auth = req.headers.get("authorization", "")
    return auth[7:] if auth.lower().startswith("bearer ") else None


def authenticate(req: Request) -> dict:
    """Resolve the current user from the token or raise 401."""
    token = _extract_token(req)
    if not token:
        raise unauthorized()
    try:
        payload = jwt.decode(token, _secret(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise unauthorized("Your session expired. Sign in again.", "token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise unauthorized("Invalid session token.", "invalid_token") from exc
    user = db.fetch_one(
        "SELECT id, username, first_name, last_name, email, role, team_id, job_title, is_archived "
        "FROM users WHERE id = %s", (payload["sub"],))
    if not user or user["is_archived"]:
        raise unauthorized("This account is no longer active.", "invalid_token")
    return user
