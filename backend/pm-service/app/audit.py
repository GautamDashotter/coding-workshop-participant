"""Append-only audit trail for every data change."""

from __future__ import annotations

import json

from psycopg.types.json import Jsonb

from app import db
from app.http import to_json

_SKIP = {"password_hash", "updated_at", "created_at"}


def diff(before: dict | None, after: dict | None) -> dict:
    """Return {field: {before, after}} for fields that changed."""
    before, after = before or {}, after or {}
    changes = {}
    for key in set(before) | set(after):
        if key in _SKIP:
            continue
        old, new = before.get(key), after.get(key)
        if to_json(old) != to_json(new):
            changes[key] = {"before": old, "after": new}
    return changes


def record(actor: dict | None, action: str, entity_type: str, entity_id, before=None, after=None) -> None:
    """Write one audit entry. Call inside the same transaction as the change."""
    db.execute(
        "INSERT INTO audit_log (actor_id, action, entity_type, entity_id, changes) VALUES (%s, %s, %s, %s, %s)",
        (actor["id"] if actor else None, action, entity_type, entity_id,
         Jsonb(json.loads(to_json(diff(before, after))))),
    )
