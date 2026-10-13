"""Project health and risk scoring. Pure functions: easy to unit test."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

SCHEDULE_GAP = 0.25   # completion lagging elapsed time by >25 points
BUDGET_WARN = 0.90    # >90% of budget spent
HOURS_WARN = 0.90     # >90% of allocated hours logged


def _ratio(part, whole) -> float | None:
    whole = float(whole or 0)
    return None if whole <= 0 else float(part or 0) / whole


def project_health(p: dict, today: dt.date | None = None) -> dict:
    """Score a project row (from PROJECT_SELECT) and explain why.

    Returns level: on_track | at_risk | high_risk | closed, plus the reasons
    and the progress figures the dashboard displays.
    """
    today = today or dt.date.today()
    total_days = max((p["end_date"] - p["start_date"]).days, 1)
    elapsed = min(max((today - p["start_date"]).days / total_days, 0.0), 1.0)
    done, total = p.get("deliverables_done", 0), p.get("deliverables_total", 0)
    completion = done / total if total else 0.0
    budget_used = _ratio(p.get("budget_spent"), p.get("budget"))
    hours_used = _ratio(p.get("hours_logged"), p.get("allocated_hours"))

    reasons = []
    if p["status"] == "active":
        if today > p["end_date"]:
            reasons.append("Past its end date")
        if p.get("deliverables_overdue"):
            reasons.append(f"{p['deliverables_overdue']} deliverable(s) overdue")
        if total and elapsed - completion > SCHEDULE_GAP:
            reasons.append(f"{round(completion * 100)}% done with {round(elapsed * 100)}% of time used")
        if budget_used is not None and budget_used > BUDGET_WARN:
            reasons.append(f"{round(budget_used * 100)}% of budget spent")
        if hours_used is not None and hours_used > HOURS_WARN:
            reasons.append(f"{round(hours_used * 100)}% of allocated hours used")

    if p["status"] != "active":
        level = "closed"
    elif today > p["end_date"] or len(reasons) >= 2 or (budget_used or 0) > 1:
        level = "high_risk"
    elif reasons:
        level = "at_risk"
    else:
        level = "on_track"

    def pct(value):
        return None if value is None else round(value * 100, 1)

    return {
        "level": level,
        "reasons": reasons,
        "time_elapsed_pct": pct(elapsed),
        "completion_pct": pct(completion),
        "budget_used_pct": pct(budget_used),
        "hours_used_pct": pct(hours_used),
        "budget_remaining": (None if p.get("budget") is None
                             else Decimal(p["budget"]) - Decimal(p.get("budget_spent") or 0)),
        "days_remaining": (p["end_date"] - today).days,
    }


def topological_order(nodes: list[str], edges: list[tuple[str, str]]) -> list[str] | None:
    """Kahn's algorithm. edges are (deliverable, depends_on). None if a cycle exists."""
    incoming = {n: 0 for n in nodes}
    children: dict[str, list[str]] = {n: [] for n in nodes}
    for node, dep in edges:
        incoming[node] += 1
        children[dep].append(node)
    ready = [n for n in nodes if incoming[n] == 0]
    order = []
    while ready:
        current = ready.pop(0)
        order.append(current)
        for child in children[current]:
            incoming[child] -= 1
            if incoming[child] == 0:
                ready.append(child)
    return order if len(order) == len(nodes) else None
