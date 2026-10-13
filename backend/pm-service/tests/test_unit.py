"""Unit tests: no database needed."""

import datetime as dt

import pytest

from app.auth import hash_password, verify_password
from app.http import ApiError, Request
from app.metrics import project_health, topological_order
from app.rbac import has_role
from app.router import Router
from app.validation import Field, validate

TODAY = dt.date(2026, 6, 1)


def _project(**overrides):
    base = {"status": "active", "start_date": dt.date(2026, 1, 1), "end_date": dt.date(2026, 12, 31),
            "deliverables_total": 4, "deliverables_done": 2, "deliverables_overdue": 0,
            "budget": 1000, "budget_spent": 300, "allocated_hours": 100, "hours_logged": 40}
    base.update(overrides)
    return base


def test_password_hash_roundtrip():
    stored = hash_password("s3cret-pass")
    assert verify_password("s3cret-pass", stored)
    assert not verify_password("wrong", stored)
    assert not verify_password("x", "garbage")


def test_role_hierarchy():
    assert has_role({"role": "admin"}, "manager")
    assert has_role({"role": "manager"}, "employee")
    assert not has_role({"role": "employee"}, "manager")


def test_request_strips_api_prefix_from_cloudfront_paths():
    req = Request.from_event({"rawPath": "/api/pm-service/projects/1", "requestContext": {"http": {"method": "get"}}})
    assert req.path == "/projects/1" and req.method == "GET"


def test_request_keeps_proxy_paths():
    assert Request.from_event({"rawPath": "/projects"}).path == "/projects"


def test_request_rejects_bad_json():
    with pytest.raises(ApiError) as err:
        Request.from_event({"rawPath": "/x", "body": "{nope"})
    assert err.value.status == 400


def test_router_params_and_405():
    r = Router()
    r.add("GET", "/projects/{id}", lambda req: (200, None))
    _, params, _ = r.match("GET", "/projects/abc/")
    assert params == {"id": "abc"}
    with pytest.raises(ApiError) as err:
        r.match("POST", "/projects/abc")
    assert err.value.status == 405
    with pytest.raises(ApiError) as err:
        r.match("GET", "/nothing")
    assert err.value.status == 404


def test_validation_collects_field_errors():
    schema = {"name": Field("str", required=True), "hours": Field("int", min_value=1),
              "start": Field("date"), "email": Field("email")}
    with pytest.raises(ApiError) as err:
        validate({"hours": 0, "start": "13/01/2026", "email": "nope"}, schema)
    fields = err.value.details["fields"]
    assert set(fields) == {"name", "hours", "start", "email"}


def test_validation_partial_ignores_missing_required():
    assert validate({"hours": "5"}, {"name": Field("str", required=True), "hours": Field("int")}, partial=True) \
        == {"hours": 5}


def test_health_on_track():
    assert project_health(_project(), TODAY)["level"] == "on_track"


def test_health_schedule_slip_is_at_risk():
    health = project_health(_project(deliverables_done=0), TODAY)
    assert health["level"] == "at_risk"
    assert "of time used" in health["reasons"][0]


def test_health_overdue_is_high_risk():
    health = project_health(_project(end_date=dt.date(2026, 5, 1)), TODAY)
    assert health["level"] == "high_risk"


def test_health_over_budget_is_high_risk():
    assert project_health(_project(budget_spent=1200), TODAY)["level"] == "high_risk"


def test_health_closed_projects():
    assert project_health(_project(status="completed"), TODAY)["level"] == "closed"


def test_topological_order_and_cycle():
    assert topological_order(["a", "b", "c"], [("b", "a"), ("c", "b")]) == ["a", "b", "c"]
    assert topological_order(["a", "b"], [("a", "b"), ("b", "a")]) is None
