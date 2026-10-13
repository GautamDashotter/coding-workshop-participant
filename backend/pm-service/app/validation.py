"""Declarative request validation with field-level error messages."""

from __future__ import annotations

import datetime as dt
import re
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any, Callable

from app.http import bad_request

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Field:
    """One field rule: type conversion plus constraints."""

    def __init__(self, kind: str, required: bool = False, choices: tuple | None = None,
                 min_value: float | None = None, max_value: float | None = None,
                 max_length: int | None = 500, nullable: bool = True,
                 check: Callable[[Any], str | None] | None = None) -> None:
        self.kind = kind
        self.required = required
        self.choices = choices
        self.min_value = min_value
        self.max_value = max_value
        self.max_length = max_length
        self.nullable = nullable
        self.check = check

    def convert(self, value: Any) -> Any:  # noqa: C901 - straightforward dispatch
        """Convert and validate a raw value; raises ValueError with a message."""
        if value is None or (isinstance(value, str) and not value.strip() and self.kind != "str"):
            if self.required or not self.nullable:
                raise ValueError("This field is required.")
            return None
        if self.kind == "str":
            if not isinstance(value, str):
                raise ValueError("Must be text.")
            value = value.strip()
            if self.required and not value:
                raise ValueError("This field is required.")
            if self.max_length and len(value) > self.max_length:
                raise ValueError(f"Must be at most {self.max_length} characters.")
            if not value and self.nullable:
                return None
        elif self.kind == "email":
            if not isinstance(value, str) or not EMAIL_RE.match(value.strip()):
                raise ValueError("Enter a valid email address.")
            value = value.strip().lower()
        elif self.kind == "int":
            if isinstance(value, bool):
                raise ValueError("Must be a whole number.")
            try:
                value = int(value)
            except (TypeError, ValueError) as exc:
                raise ValueError("Must be a whole number.") from exc
        elif self.kind == "decimal":
            try:
                value = Decimal(str(value))
            except InvalidOperation as exc:
                raise ValueError("Must be a number.") from exc
        elif self.kind == "date":
            try:
                value = dt.date.fromisoformat(str(value)[:10])
            except ValueError as exc:
                raise ValueError("Use the format YYYY-MM-DD.") from exc
        elif self.kind == "uuid":
            try:
                value = str(uuid.UUID(str(value)))
            except ValueError as exc:
                raise ValueError("Must be a valid id.") from exc
        elif self.kind == "uuid_list":
            if not isinstance(value, list):
                raise ValueError("Must be a list of ids.")
            try:
                value = [str(uuid.UUID(str(v))) for v in value]
            except ValueError as exc:
                raise ValueError("Every item must be a valid id.") from exc
        elif self.kind == "bool":
            if not isinstance(value, bool):
                raise ValueError("Must be true or false.")
        if self.choices and value not in self.choices:
            raise ValueError(f"Must be one of: {', '.join(self.choices)}.")
        if self.min_value is not None and value < self.min_value:
            raise ValueError(f"Must be at least {self.min_value}.")
        if self.max_value is not None and value > self.max_value:
            raise ValueError(f"Must be at most {self.max_value}.")
        if self.check:
            message = self.check(value)
            if message:
                raise ValueError(message)
        return value


def validate(body: dict, schema: dict[str, Field], partial: bool = False) -> dict:
    """Validate a body against a schema.

    partial=True (updates): only provided fields are checked, unknown ones ignored.
    """
    clean, errors = {}, {}
    for name, rule in schema.items():
        if name not in body:
            if rule.required and not partial:
                errors[name] = "This field is required."
            continue
        try:
            clean[name] = rule.convert(body[name])
        except ValueError as exc:
            errors[name] = str(exc)
    if errors:
        raise bad_request("Some fields need attention.", {"fields": errors})
    return clean


def check_date_order(start: dt.date | None, end: dt.date | None, strict: bool = True,
                     field: str = "end_date") -> None:
    """Ensure end is after (or on, if not strict) start."""
    if start and end and (end <= start if strict else end < start):
        raise bad_request("Dates are out of order.",
                          {"fields": {field: "Must be after the start date." if strict
                                      else "Must be on or after the start date."}})


def check_within(start: dt.date, end: dt.date, outer_start: dt.date, outer_end: dt.date, what: str) -> None:
    """Ensure [start, end] sits inside the outer range."""
    if start < outer_start or end > outer_end:
        raise bad_request(f"{what} dates must fall within the project dates "
                          f"({outer_start.isoformat()} to {outer_end.isoformat()}).",
                          {"fields": {"start_date": "Outside project dates.", "end_date": "Outside project dates."}})


def page_params(query: dict) -> tuple[int, int]:
    """Parse ?limit=&offset= with safe bounds."""
    try:
        limit = min(max(int(query.get("limit", 100)), 1), 500)
        offset = max(int(query.get("offset", 0)), 0)
    except ValueError as exc:
        raise bad_request("limit and offset must be numbers.") from exc
    return limit, offset
