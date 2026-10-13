"""Portfolio reports answering the business questions."""

from __future__ import annotations

from app import db, rbac
from app.handlers.projects import PROJECT_SELECT, _with_health
from app.http import Request


def dashboard(req: Request) -> tuple[int, dict]:
    """GET /reports/dashboard - status, risk and budget for every visible active project."""
    clause, params = rbac.visible_projects_clause(req.user)
    projects = _with_health(db.fetch_all(
        f"{PROJECT_SELECT} WHERE {clause} AND p.status = 'active' AND NOT p.is_archived ORDER BY p.end_date",
        params))
    counts = {"on_track": 0, "at_risk": 0, "high_risk": 0}
    for p in projects:
        counts[p["health"]["level"]] += 1
    budget = sum(float(p["budget"] or 0) for p in projects)
    spent = sum(float(p["budget_spent"] or 0) for p in projects)
    upcoming = db.fetch_all(
        f"SELECT d.id, d.seq_no, d.name, d.end_date, d.status, p.id AS project_id, p.name AS project_name "
        f"FROM deliverables d JOIN projects p ON p.id = d.project_id WHERE {clause} AND p.status = 'active' "
        f"AND NOT p.is_archived AND NOT d.is_archived AND d.status <> 'completed' "
        f"AND d.end_date <= CURRENT_DATE + 14 ORDER BY d.end_date LIMIT 10", params)
    return 200, {
        "projects": projects,
        "risk_counts": counts,
        "active_projects": len(projects),
        "budget_total": budget,
        "budget_spent": spent,
        "upcoming_deliverables": upcoming,
    }


def resource_allocation(req: Request) -> tuple[int, dict]:
    """GET /reports/resources?date= - current allocation per person, flagging >100%.

    Managers see their own team members plus anyone on their projects.
    """
    rbac.require_role(req.user, "manager")
    on_date = req.query.get("date") or None
    scope, params = "TRUE", []
    if not rbac.is_admin(req.user):
        scope = ("(u.team_id IN (SELECT id FROM teams WHERE manager_id = %s) OR EXISTS ("
                 "SELECT 1 FROM allocations a2 JOIN projects p2 ON p2.id = a2.project_id "
                 "WHERE a2.user_id = u.id AND p2.manager_id = %s))")
        params = [req.user["id"], req.user["id"]]
    rows = db.fetch_all(
        "SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.job_title, t.name AS team_name, "
        "COALESCE(sum(a.allocation_percent) FILTER (WHERE p.id IS NOT NULL), 0) AS total_percent, "
        "COALESCE(json_agg(json_build_object('project_id', p.id, 'project_name', p.name, "
        "  'percent', a.allocation_percent, 'end_date', a.end_date)) FILTER (WHERE p.id IS NOT NULL), '[]') "
        "  AS projects "
        "FROM users u LEFT JOIN teams t ON t.id = u.team_id "
        "LEFT JOIN allocations a ON a.user_id = u.id "
        "  AND COALESCE(%s::date, CURRENT_DATE) BETWEEN a.start_date AND a.end_date "
        "LEFT JOIN projects p ON p.id = a.project_id AND p.status = 'active' AND NOT p.is_archived "
        f"WHERE NOT u.is_archived AND u.role <> 'admin' AND {scope} "
        "GROUP BY u.id, t.name ORDER BY total_percent DESC, name", [on_date, *params])
    for r in rows:
        r["status"] = ("over_allocated" if r["total_percent"] > 100
                       else "available" if r["total_percent"] < 50 else "allocated")
    return 200, {
        "items": rows,
        "over_allocated": sum(1 for r in rows if r["status"] == "over_allocated"),
        "available": sum(1 for r in rows if r["status"] == "available"),
    }
