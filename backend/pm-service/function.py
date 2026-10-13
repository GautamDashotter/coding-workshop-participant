"""ACME Project Tracker API - single Lambda entry point.

One Lambda with internal routing keeps shared code (auth, RBAC, DB, audit)
in one deployable package; the domains stay separated in app/handlers/.
"""

import logging
import uuid

import psycopg

from app import db
from app.auth import authenticate
from app.http import ApiError, Request, error_response, response
from app.migrate import ensure_schema
from app.routes import build_router

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ROUTER = build_router()


def _validate_path_ids(params: dict) -> None:
    for key, value in params.items():
        if key == "id" or key.endswith("_id"):
            try:
                uuid.UUID(value)
            except ValueError as exc:
                raise ApiError(404, "not_found", "Record not found.") from exc


def handler(event=None, context=None):
    """Lambda handler: parse, authenticate, route, and map errors to responses."""
    event = event or {}
    try:
        req = Request.from_event(event)
        if req.method == "OPTIONS":
            return response(204)
        route, params, public = ROUTER.match(req.method, req.path)
        _validate_path_ids(params)
        req.path_params = params
        ensure_schema()
        if not public:
            req.user = authenticate(req)
        status, body = route(req)
        logger.info("%s %s -> %s", req.method, req.path, status)
        return response(status, body)
    except ApiError as err:
        logger.info("API error %s: %s", err.status, err.message)
        return error_response(err)
    except psycopg.OperationalError as exc:
        logger.error("Database unavailable: %s", exc)
        db.reset_conn()
        return error_response(ApiError(503, "database_unavailable", "The database is unavailable. Try again."))
    except Exception:  # noqa: BLE001 - last-resort guard
        logger.exception("Unhandled error")
        db.reset_conn()
        return error_response(ApiError(500, "internal_error", "Something went wrong on the server."))


if __name__ == "__main__":
    print(handler({"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}))
