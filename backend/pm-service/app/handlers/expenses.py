"""Budget tracking: money spent against a project's budget."""

from __future__ import annotations

from app import audit, db, rbac
from app.http import Request, bad_request, not_found
from app.validation import Field, validate

CATEGORIES = ("labor", "software", "hardware", "services", "travel", "other")
SCHEMA = {
    "category": Field("str", required=True, choices=CATEGORIES),
    "description": Field("str", max_length=1000),
    "amount": Field("decimal", required=True, min_value=0.01, max_value=1_000_000_000),
    "spent_on": Field("date", required=True),
}


def list_expenses(req: Request) -> tuple[int, dict]:
    """GET /projects/{id}/expenses - with totals by category."""
    project = rbac.get_visible_project(req.user, req.path_params["id"])
    rows = db.fetch_all("SELECT e.*, u.first_name || ' ' || u.last_name AS created_by_name FROM expenses e "
                        "LEFT JOIN users u ON u.id = e.created_by WHERE e.project_id = %s "
                        "ORDER BY e.spent_on DESC", (project["id"],))
    by_category = db.fetch_all("SELECT category, sum(amount) AS total FROM expenses WHERE project_id = %s "
                               "GROUP BY category ORDER BY total DESC", (project["id"],))
    spent = sum(r["amount"] for r in rows)
    return 200, {"items": rows, "total": len(rows), "spent": spent, "budget": project["budget"],
                 "by_category": by_category}


def create_expense(req: Request) -> tuple[int, dict]:
    """POST /projects/{id}/expenses - project manager or admin."""
    project = rbac.get_managed_project(req.user, req.path_params["id"])
    data = validate(req.body, SCHEMA)
    if not project["start_date"] <= data["spent_on"] <= project["end_date"]:
        raise bad_request("Expense date must fall within the project dates.",
                          {"fields": {"spent_on": "Outside project dates."}})
    with db.transaction():
        row = db.execute("INSERT INTO expenses (project_id, category, description, amount, spent_on, created_by) "
                         "VALUES (%s, %s, %s, %s, %s, %s) RETURNING *",
                         (project["id"], data["category"], data.get("description"), data["amount"],
                          data["spent_on"], req.user["id"]))
        audit.record(req.user, "create", "expense", row["id"], None, row)
    return 201, row


def delete_expense(req: Request) -> tuple[int, None]:
    """DELETE /expenses/{id}."""
    row = db.fetch_one("SELECT * FROM expenses WHERE id = %s", (req.path_params["id"],))
    if not row:
        raise not_found("Expense")
    rbac.get_managed_project(req.user, str(row["project_id"]))
    with db.transaction():
        db.execute("DELETE FROM expenses WHERE id = %s", (row["id"],))
        audit.record(req.user, "archive", "expense", row["id"], row, None)
    return 204, None
