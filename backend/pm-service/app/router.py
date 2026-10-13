"""Minimal path router: ('GET', '/projects/{id}') -> handler."""

from __future__ import annotations

import re
from typing import Callable

from app.http import ApiError, Request

Handler = Callable[[Request], tuple[int, object]]


class Router:
    """Collects routes and dispatches requests to them."""

    def __init__(self) -> None:
        self._routes: list[tuple[str, re.Pattern, Handler, bool]] = []

    def add(self, method: str, pattern: str, handler: Handler, public: bool = False) -> None:
        """Register a handler. `{name}` segments become path params."""
        regex = "^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", pattern.rstrip("/") or "/") + "$"
        self._routes.append((method.upper(), re.compile(regex), handler, public))

    def match(self, method: str, path: str) -> tuple[Handler, dict, bool]:
        """Find the handler for a request; 404 / 405 when there is none."""
        path = path.rstrip("/") or "/"
        allowed = []
        for route_method, regex, handler, public in self._routes:
            found = regex.match(path)
            if found:
                if route_method == method:
                    return handler, found.groupdict(), public
                allowed.append(route_method)
        if allowed:
            raise ApiError(405, "method_not_allowed", f"Use one of: {', '.join(sorted(set(allowed)))}.")
        raise ApiError(404, "not_found", f"No endpoint at {path}.")
