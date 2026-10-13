"""Role-based access control. All permission checks live here.

Role hierarchy: admin > manager > employee (each inherits the one below).
"""

from __future__ import annotations

from app import db
from app.http import forbidden, not_found

ROLE_RANK = {"employee": 1, "manager": 2, "admin": 3}


def has_role(user: dict, minimum: str) -> bool:
    """True when the user's role is at least `minimum`."""
    return ROLE_RANK[user["role"]] >= ROLE_RANK[minimum]


def require_role(user: dict, minimum: str) -> None:
    """Raise 403 unless the user's role is at least `minimum`."""
    if not has_role(user, minimum):
        raise forbidden()


def is_admin(user: dict) -> bool:
    """Shortcut for admin checks."""
    return user["role"] == "admin"


def visible_projects_clause(user: dict, alias: str = "p") -> tuple[str, list]:
    """SQL filter for the projects a user may see.

    - admin: everything (archived filtered separately by the caller)
    - manager: active, unarchived projects they manage or their teams work on
    - employee: active, unarchived projects their team is assigned to
    """
    if is_admin(user):
        return "TRUE", []
    if user["role"] == "manager":
        return (
            f"({alias}.status = 'active' AND NOT {alias}.is_archived AND ("
            f"{alias}.manager_id = %s OR EXISTS (SELECT 1 FROM project_teams pt JOIN teams t ON t.id = pt.team_id "
            f"WHERE pt.project_id = {alias}.id AND t.manager_id = %s)))",
            [user["id"], user["id"]],
        )
    return (
        f"({alias}.status = 'active' AND NOT {alias}.is_archived AND EXISTS ("
        f"SELECT 1 FROM project_teams pt WHERE pt.project_id = {alias}.id AND pt.team_id = %s))",
        [user["team_id"]],
    )


def get_visible_project(user: dict, project_id: str) -> dict:
    """Load a project the user may see, or 404 (never leak existence)."""
    clause, params = visible_projects_clause(user)
    project = db.fetch_one(f"SELECT p.* FROM projects p WHERE p.id = %s AND {clause}", [project_id, *params])
    if not project:
        raise not_found("Project")
    return project


def can_manage_project(user: dict, project: dict) -> bool:
    """Admins manage all projects; managers only the ones they own."""
    return is_admin(user) or (user["role"] == "manager" and str(project["manager_id"]) == str(user["id"]))


def require_project_manager(user: dict, project: dict) -> None:
    """Raise 403 unless the user manages this project."""
    if not can_manage_project(user, project):
        raise forbidden("Only this project's manager or an admin can change it.")


def get_managed_project(user: dict, project_id: str) -> dict:
    """Load a visible project and ensure the user can change it."""
    project = get_visible_project(user, project_id)
    require_project_manager(user, project)
    if project["is_archived"] or project["status"] != "active":
        raise forbidden("Closed projects are read-only. Restore the project first.")
    return project
