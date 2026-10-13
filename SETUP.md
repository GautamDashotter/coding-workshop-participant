# ACME Project Tracker – setup

Copy these folders into your `coding-workshop-participant` repo, replacing the originals:

```
backend/pm-service/     -> Python Lambda API (connects to PostgreSQL)
frontend/               -> React + Material UI app (talks to the API)
bin/proxy-server.js     -> patched local proxy (forwards the login token)
bin/seed-demo.py        -> optional demo data loader
```

How the pieces connect: Browser (React) -> /api/pm-service -> Lambda (Python) -> PostgreSQL.
The frontend never talks to the database directly; the backend owns all DB access and permissions.

## Run locally (in the VDI)

```bash
cd ~/coding-workshop-participant
source ~/.bashrc
./bin/start-dev.sh          # starts Postgres, LocalStack, the Lambda, proxy (:3001) and frontend (:3000)
```

The backend creates all tables on its first request, and seeds an admin:
`admin@acme.com` / `ChangeMe123!` (change it from Profile after signing in).

Optional demo data (projects at every risk level, an over-allocated person):

```bash
python3 bin/seed-demo.py                          # local
python3 bin/seed-demo.py https://<cloudfront>     # cloud
```

Demo logins: priya@acme.com (manager), dana@acme.com (employee), password `Password1!`.

## Deploy to AWS

```bash
./bin/deploy-backend.sh
./bin/deploy-frontend.sh
```

In the cloud the backend reads the Aurora settings Terraform injects (POSTGRES_HOST etc.) and
adds `sslmode=require` automatically. Set `JWT_SECRET` and `SEED_ADMIN_PASSWORD` as Lambda
environment variables for production; otherwise a secret is derived per environment.

## Tests

```bash
cd backend/pm-service && pip install -r requirements-dev.txt && pytest --cov=app   # 40 tests, 93% coverage
cd frontend && npm install && npm test                                              # 14 tests
```

Backend tests use a throwaway `pm_test` database on the local Postgres.

## Design decisions

- One Lambda with internal routing, so auth, RBAC, DB and audit code is shared; domains are separate modules in `app/handlers/`.
- Roles inherit: admin > manager > employee. All permission checks live in `app/rbac.py`.
- Deliverables are the spec's "milestones": sequential numbers, assignees and a dependency chain (loops are rejected).
- Completing or abandoning a project archives it. Deletes are soft (archive), and admins can restore.
- The audit log is append-only, enforced by a database trigger.
- The token is sent as `X-Auth-Token` because the local proxy and CloudFront both pass it through reliably.
