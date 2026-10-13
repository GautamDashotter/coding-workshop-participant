#!/usr/bin/env python3
"""Seed realistic demo data through the API (works locally and in the cloud).

Usage:
  python3 bin/seed-demo.py                                    # local (proxy on :3001)
  python3 bin/seed-demo.py https://<cloudfront-domain>        # cloud
Env: ADMIN_LOGIN (default admin@acme.com), ADMIN_PASSWORD (default ChangeMe123!)
Every demo user's password is Password1!
"""

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3001").rstrip("/") + "/api/pm-service"
TODAY = dt.date.today()


def day(offset: int) -> str:
    return (TODAY + dt.timedelta(days=offset)).isoformat()


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Content-Type": "application/json", **({"X-Auth-Token": token} if token else {})})
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        print(f"  ! {method} {path}: {err.code} {err.read().decode()[:200]}")
        return None


def login(who, password="Password1!"):
    return call("POST", "/auth/login", {"login": who, "password": password})["token"]


admin = login(os.getenv("ADMIN_LOGIN", "admin@acme.com"), os.getenv("ADMIN_PASSWORD", "ChangeMe123!"))
print("Signed in as admin")

managers = {}
for first, last, email in [("Priya", "Raman", "priya@acme.com"), ("Marcus", "Hale", "marcus@acme.com")]:
    managers[email] = call("POST", "/users", {"first_name": first, "last_name": last, "email": email,
                                              "password": "Password1!", "role": "manager",
                                              "job_title": "Project Manager"}, admin)
priya, marcus = login("priya@acme.com"), login("marcus@acme.com")

platform = call("POST", "/teams", {"name": "Platform Engineering", "department": "Technology"}, priya)
data = call("POST", "/teams", {"name": "Data & Analytics", "department": "Technology"}, marcus)

people = {}
for first, last, title, team in [("Dana", "Okafor", "Site Reliability Engineer", platform),
                                 ("Leo", "Brandt", "Backend Engineer", platform),
                                 ("Mei", "Tanaka", "Network Engineer", platform),
                                 ("Sam", "Ortiz", "Data Engineer", data),
                                 ("Ana", "Silva", "Analyst", data)]:
    people[first] = call("POST", "/users", {
        "first_name": first, "last_name": last, "email": f"{first.lower()}@acme.com", "password": "Password1!",
        "role": "employee", "job_title": title, "team_id": team["id"], "salary": 95000}, admin)

projects = [
    # name, manager, start, end, hours, budget, team, spent, deliverables [(name, start, end, done)]
    ("Data center exit", managers["priya@acme.com"], -120, 60, 4000, 250000, platform, 238000,
     [("Server inventory", -120, -90, True), ("Decommission 200 servers", -90, -10, False),
      ("Network cutover", -10, 40, False), ("Lease handback", 40, 60, False)]),
    ("Customer analytics platform", managers["marcus@acme.com"], -60, 120, 2500, 180000, data, 52000,
     [("Data model", -60, -30, True), ("Ingestion pipelines", -30, -3, False), ("Dashboards", -3, 110, False)]),
    ("Zero-trust network rollout", managers["priya@acme.com"], -30, 150, 1800, 90000, platform, 15000,
     [("Policy design", -30, 10, False), ("Pilot sites", 10, 70, False), ("Global rollout", 70, 150, False)]),
    ("Legacy CRM migration", managers["marcus@acme.com"], -200, -5, 3000, 120000, data, 131000,
     [("Field mapping", -200, -150, True), ("Data migration", -150, -40, True), ("Cutover", -40, -5, False)]),
]

for name, mgr, start, end, hours, budget, team, spent, items in projects:
    project = call("POST", "/projects", {"name": name, "department": "Technology", "start_date": day(start),
                                         "end_date": day(end), "allocated_hours": hours, "budget": budget,
                                         "manager_id": mgr["id"], "description": f"{name} programme."}, admin)
    token = priya if mgr["email"] == "priya@acme.com" else marcus
    call("POST", f"/projects/{project['id']}/teams", {"team_id": team["id"]}, token)
    previous = None
    for d_name, d_start, d_end, done in items:
        d = call("POST", f"/projects/{project['id']}/deliverables",
                 {"name": d_name, "start_date": day(d_start), "end_date": day(d_end),
                  "status": "in_progress" if d_start <= 0 <= d_end else "planned"}, token)
        if previous:
            call("POST", f"/deliverables/{d['id']}/dependencies", {"depends_on_id": previous["id"]}, token)
        if done:
            call("POST", f"/deliverables/{d['id']}/complete", token=token)
        previous = d
    call("POST", f"/projects/{project['id']}/expenses",
         {"category": "services", "amount": spent, "spent_on": day(min(max(start, -1), end)),
          "description": "Vendor and contractor costs"}, token)
    print(f"Created {name}")

# Dana ends up over-allocated across two Platform projects.
proj = {p["name"]: p for p in call("GET", "/projects", token=admin)["items"]}
for pname, person, pct, token in [("Data center exit", "Dana", 70, priya), ("Zero-trust network rollout", "Dana", 60, priya),
                                  ("Data center exit", "Leo", 50, priya), ("Zero-trust network rollout", "Mei", 80, priya),
                                  ("Customer analytics platform", "Sam", 100, marcus),
                                  ("Customer analytics platform", "Ana", 40, marcus)]:
    p = proj[pname]
    call("POST", "/allocations", {"project_id": p["id"], "user_id": people[person]["id"],
                                  "allocation_percent": pct, "start_date": p["start_date"],
                                  "end_date": p["end_date"]}, token)
print("Done. Sign in as priya@acme.com / dana@acme.com etc. with Password1!")
