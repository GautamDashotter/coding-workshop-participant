"""PostgreSQL connection management and query helpers (psycopg 3)."""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row

from app.http import ApiError, bad_request, conflict

_CONN: psycopg.Connection | None = None


def _conninfo() -> str:
    is_local = os.getenv("IS_LOCAL", "true") == "true"
    info = (
        f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
        f"port={os.getenv('POSTGRES_PORT', '5432')} "
        f"user={os.getenv('POSTGRES_USER', 'postgres')} "
        f"password={os.getenv('POSTGRES_PASS', 'postgres123')} "
        f"dbname={os.getenv('POSTGRES_NAME', 'postgres')} "
        "connect_timeout=15"
    )
    return info if is_local else info + " sslmode=require"


def get_conn() -> psycopg.Connection:
    """Return a pooled connection that survives across warm Lambda invocations."""
    global _CONN
    if _CONN is None or _CONN.closed or _CONN.broken:
        _CONN = psycopg.connect(_conninfo(), autocommit=True, row_factory=dict_row)
    return _CONN


def reset_conn() -> None:
    """Drop the pooled connection (used after fatal errors)."""
    global _CONN
    if _CONN is not None:
        try:
            _CONN.close()
        except Exception:  # noqa: BLE001 - best effort
            pass
    _CONN = None


@contextmanager
def transaction() -> Iterator[psycopg.Connection]:
    """Run the block atomically; rolls back on any exception."""
    conn = get_conn()
    with conn.transaction():
        yield conn


def _translate(exc: psycopg.Error) -> ApiError:
    if isinstance(exc, psycopg.errors.UniqueViolation):
        return conflict("A record with the same unique value already exists.")
    if isinstance(exc, psycopg.errors.ForeignKeyViolation):
        return bad_request("A referenced record does not exist.")
    if isinstance(exc, psycopg.errors.CheckViolation):
        return bad_request(f"Value violates a rule: {exc.diag.constraint_name}.")
    if isinstance(exc, (psycopg.errors.InvalidTextRepresentation, psycopg.errors.DataError)):
        return bad_request("A value has the wrong format.")
    raise exc


def fetch_all(sql: str, params: Any = None) -> list[dict]:
    """Run a query and return all rows as dicts."""
    try:
        with get_conn().cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()
    except psycopg.Error as exc:
        raise _translate(exc) from exc


def fetch_one(sql: str, params: Any = None) -> dict | None:
    """Run a query and return the first row or None."""
    rows = fetch_all(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: Any = None) -> dict | None:
    """Run a statement; returns the RETURNING row when present."""
    try:
        with get_conn().cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone() if cur.description else None
    except psycopg.Error as exc:
        raise _translate(exc) from exc
