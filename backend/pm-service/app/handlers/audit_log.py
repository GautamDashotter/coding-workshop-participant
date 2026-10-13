"""Audit log viewer (admin only)."""

from __future__ import annotations

from app import db, rbac
from app.http import Request
from app.validation import page_params


def list_audit(req: Request) -> tuple[int, dict]:
    """GET /audit-log?entity_type=&entity_id=&actor_id=&action=."""
    rbac.require_role(req.user, "admin")
    limit, offset = page_params(req.query)
    where, params = ["TRUE"], []
    for key in ("entity_type", "entity_id", "actor_id", "action"):
        if req.query.get(key):
            where.append(f"a.{key} = %s")
            params.append(req.query[key])
    rows = db.fetch_all(
        "SELECT a.*, u.first_name || ' ' || u.last_name AS actor_name, count(*) OVER () AS total "
        "FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id "
        f"WHERE {' AND '.join(where)} ORDER BY a.created_at DESC LIMIT %s OFFSET %s", [*params, limit, offset])
    total = rows[0]["total"] if rows else 0
    return 200, {"items": [{k: v for k, v in r.items() if k != "total"} for r in rows], "total": total}
