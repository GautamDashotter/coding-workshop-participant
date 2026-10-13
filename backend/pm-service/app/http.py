"""HTTP primitives: request parsing, JSON responses and API errors."""

from __future__ import annotations

import base64
import datetime as dt
import decimal
import json
import uuid
from dataclasses import dataclass, field
from typing import Any


class ApiError(Exception):
    """An error that maps directly to an HTTP response."""

    def __init__(self, status: int, code: str, message: str, details: dict | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


def bad_request(message: str, details: dict | None = None) -> ApiError:
    """Validation or malformed-input error (400)."""
    return ApiError(400, "validation_error", message, details)


def unauthorized(message: str = "Sign in to continue.", code: str = "unauthorized") -> ApiError:
    """Missing or invalid credentials (401)."""
    return ApiError(401, code, message)


def forbidden(message: str = "You do not have permission to do this.") -> ApiError:
    """Authenticated but not allowed (403)."""
    return ApiError(403, "access_denied", message)


def not_found(entity: str) -> ApiError:
    """Entity missing or not visible to the caller (404)."""
    return ApiError(404, "not_found", f"{entity} not found.")


def conflict(message: str) -> ApiError:
    """Uniqueness or state conflict (409)."""
    return ApiError(409, "conflict", message)


def _json_default(value: Any) -> Any:
    if isinstance(value, (dt.datetime, dt.date)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    raise TypeError(f"Not JSON serializable: {type(value).__name__}")


def to_json(data: Any) -> str:
    """Serialize data including dates, decimals and UUIDs."""
    return json.dumps(data, default=_json_default)


def response(status: int, body: Any = None) -> dict:
    """Build a Lambda Function URL response."""
    result = {"statusCode": status, "headers": {"Content-Type": "application/json"}}
    if body is not None and status != 204:
        result["body"] = to_json(body)
    return result


def error_response(err: ApiError) -> dict:
    """Consistent error envelope for every failure."""
    return response(err.status, {"error": {"code": err.code, "message": err.message, "details": err.details}})


@dataclass
class Request:
    """Normalized view of a Lambda Function URL event."""

    method: str
    path: str
    query: dict[str, str]
    headers: dict[str, str]
    body: dict[str, Any]
    path_params: dict[str, str] = field(default_factory=dict)
    user: dict | None = None

    @classmethod
    def from_event(cls, event: dict) -> "Request":
        """Parse a Function URL (payload v2) event.

        CloudFront forwards the full path (/api/pm-service/projects) while the
        local proxy strips the prefix (/projects); both are normalized here.
        """
        method = (event.get("requestContext", {}).get("http", {}).get("method")
                  or event.get("httpMethod") or "GET").upper()
        path = event.get("rawPath") or event.get("path") or "/"
        parts = [p for p in path.split("/") if p]
        if len(parts) >= 2 and parts[0] == "api":
            parts = parts[2:]
        headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
        raw_body = event.get("body") or ""
        if raw_body and event.get("isBase64Encoded"):
            raw_body = base64.b64decode(raw_body).decode("utf-8")
        body: dict[str, Any] = {}
        if raw_body:
            try:
                body = json.loads(raw_body)
            except json.JSONDecodeError as exc:
                raise bad_request("Request body must be valid JSON.") from exc
            if not isinstance(body, dict):
                raise bad_request("Request body must be a JSON object.")
        return cls(method=method, path="/" + "/".join(parts), query=event.get("queryStringParameters") or {},
                   headers=headers, body=body)
