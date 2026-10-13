"""Apply the schema and seed the first admin. Runs once per Lambda container."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from app import db
from app.auth import hash_password

logger = logging.getLogger(__name__)
_DONE = False
_LOCK_KEY = 4815162342


def ensure_schema() -> None:
    """Create tables if missing and seed an admin when the users table is empty."""
    global _DONE
    if _DONE:
        return
    sql = (Path(__file__).parent / "schema.sql").read_text()
    with db.transaction() as conn:
        # Advisory lock: concurrent cold starts must not race each other.
        conn.execute("SELECT pg_advisory_xact_lock(%s)", (_LOCK_KEY,))
        conn.execute(sql)
        if conn.execute("SELECT count(*) AS n FROM users").fetchone()["n"] == 0:
            password = os.getenv("SEED_ADMIN_PASSWORD", "ChangeMe123!")
            conn.execute(
                "INSERT INTO users (username, first_name, last_name, email, password_hash, role, job_title) "
                "VALUES ('admin0', 'System', 'Admin', 'admin@acme.com', %s, 'admin', 'Administrator')",
                (hash_password(password),))
            logger.warning("Seeded admin user admin@acme.com - change the password after first login.")
    _DONE = True
