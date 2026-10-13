"""Route table: every endpoint the API exposes."""

from __future__ import annotations

from app.handlers import (allocations, audit_log, auth, deliverables, expenses, projects, reports, teams,
                          time_entries, users)
from app.router import Router


def build_router() -> Router:
    """Register all routes. Public routes skip authentication."""
    r = Router()
    r.add("GET", "/health", lambda req: (200, {"status": "ok"}), public=True)

    r.add("POST", "/auth/login", auth.login, public=True)
    r.add("POST", "/auth/refresh", auth.refresh)
    r.add("GET", "/auth/me", auth.me)
    r.add("PUT", "/auth/me", auth.update_me)
    r.add("POST", "/auth/password", auth.change_password)

    r.add("GET", "/users", users.list_users)
    r.add("POST", "/users", users.create_user)
    r.add("GET", "/users/{id}", users.get_user)
    r.add("PUT", "/users/{id}", users.update_user)
    r.add("DELETE", "/users/{id}", users.archive_user)
    r.add("POST", "/users/{id}/restore", users.restore_user)

    r.add("GET", "/teams", teams.list_teams)
    r.add("POST", "/teams", teams.create_team)
    r.add("GET", "/teams/{id}", teams.get_team)
    r.add("PUT", "/teams/{id}", teams.update_team)
    r.add("DELETE", "/teams/{id}", teams.archive_team)

    r.add("GET", "/projects", projects.list_projects)
    r.add("POST", "/projects", projects.create_project)
    r.add("GET", "/projects/{id}", projects.get_project)
    r.add("PUT", "/projects/{id}", projects.update_project)
    r.add("DELETE", "/projects/{id}", projects.archive_project)
    r.add("POST", "/projects/{id}/status", projects.set_status)
    r.add("POST", "/projects/{id}/restore", projects.restore_project)
    r.add("POST", "/projects/{id}/teams", projects.assign_team)
    r.add("DELETE", "/projects/{id}/teams/{team_id}", projects.unassign_team)
    r.add("GET", "/projects/{id}/people", projects.project_people)
    r.add("GET", "/projects/{id}/deliverables", deliverables.list_deliverables)
    r.add("POST", "/projects/{id}/deliverables", deliverables.create_deliverable)
    r.add("GET", "/projects/{id}/dependency-graph", deliverables.dependency_graph)
    r.add("GET", "/projects/{id}/expenses", expenses.list_expenses)
    r.add("POST", "/projects/{id}/expenses", expenses.create_expense)

    r.add("GET", "/deliverables/{id}", deliverables.get_deliverable)
    r.add("PUT", "/deliverables/{id}", deliverables.update_deliverable)
    r.add("DELETE", "/deliverables/{id}", deliverables.archive_deliverable)
    r.add("POST", "/deliverables/{id}/complete", deliverables.complete_deliverable)
    r.add("POST", "/deliverables/{id}/dependencies", deliverables.add_dependency)
    r.add("DELETE", "/deliverables/{id}/dependencies/{dep_id}", deliverables.remove_dependency)

    r.add("GET", "/allocations", allocations.list_allocations)
    r.add("POST", "/allocations", allocations.create_allocation)
    r.add("PUT", "/allocations/{id}", allocations.update_allocation)
    r.add("DELETE", "/allocations/{id}", allocations.delete_allocation)

    r.add("GET", "/time-entries", time_entries.list_entries)
    r.add("POST", "/time-entries", time_entries.create_entry)
    r.add("DELETE", "/time-entries/{id}", time_entries.delete_entry)

    r.add("DELETE", "/expenses/{id}", expenses.delete_expense)

    r.add("GET", "/reports/dashboard", reports.dashboard)
    r.add("GET", "/reports/resources", reports.resource_allocation)
    r.add("GET", "/audit-log", audit_log.list_audit)
    return r
