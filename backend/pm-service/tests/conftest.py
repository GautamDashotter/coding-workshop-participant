"""Test fixtures.

Integration tests run the real Lambda handler against a throwaway PostgreSQL
database (pm_test) on the local workshop Postgres. They are skipped
automatically when Postgres is not reachable.
"""

import json
import os

import psycopg
import pytest

os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("POSTGRES_USER", "postgres")
os.environ.setdefault("POSTGRES_PASS", "postgres123")
os.environ["POSTGRES_NAME"] = "pm_test"
os.environ["IS_LOCAL"] = "true"
os.environ["SEED_ADMIN_PASSWORD"] = "AdminPass1!"

ADMIN_DSN = (f"host={os.environ['POSTGRES_HOST']} user={os.environ['POSTGRES_USER']} "
             f"password={os.environ['POSTGRES_PASS']} dbname=postgres connect_timeout=3")


def _recreate_db() -> bool:
    try:
        with psycopg.connect(ADMIN_DSN, autocommit=True) as conn:
            conn.execute("DROP DATABASE IF EXISTS pm_test WITH (FORCE)")
            conn.execute("CREATE DATABASE pm_test")
        return True
    except psycopg.OperationalError:
        return False


@pytest.fixture(scope="session")
def api():
    """Call the handler like Lambda would. Returns (status, body)."""
    if not _recreate_db():
        pytest.skip("PostgreSQL not reachable; start it with ./bin/start-dev.sh")
    from app import db, migrate
    db.reset_conn()
    migrate._DONE = False
    import function

    def call(method, path, body=None, token=None, query=None):
        event = {
            "rawPath": f"/api/pm-service{path}",
            "requestContext": {"http": {"method": method}},
            "headers": {"x-auth-token": token} if token else {},
            "queryStringParameters": query,
            "body": json.dumps(body) if body is not None else None,
        }
        res = function.handler(event)
        return res["statusCode"], json.loads(res["body"]) if res.get("body") else None

    return call
