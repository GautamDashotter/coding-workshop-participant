-- ACME Project Tracker - PostgreSQL schema
-- Idempotent: safe to run on every cold start (see app/migrate.py).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'manager', 'employee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE project_status AS ENUM ('active', 'completed', 'abandoned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE deliverable_status AS ENUM ('planned', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM (
        'create', 'update', 'archive', 'restore', 'assign_role',
        'assign_team', 'complete', 'abandon', 'login'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Teams are created before users; the manager FK is added after users exists.
CREATE TABLE IF NOT EXISTS teams (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL UNIQUE,
    department   TEXT,
    manager_id   UUID,
    is_archived  BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username            CHAR(6) NOT NULL UNIQUE,
    first_name          TEXT NOT NULL,
    last_name           TEXT NOT NULL,
    email               TEXT NOT NULL UNIQUE,
    password_hash       TEXT NOT NULL,
    role                user_role NOT NULL DEFAULT 'employee',
    job_title           TEXT,
    salary              NUMERIC(12, 2) CHECK (salary IS NULL OR salary >= 0),
    profile_picture_url TEXT,
    team_id             UUID REFERENCES teams(id),
    is_archived         BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Employees must belong to exactly one team; managers/admins may not.
    CONSTRAINT employee_needs_team CHECK (role <> 'employee' OR team_id IS NOT NULL)
);

DO $$ BEGIN
    ALTER TABLE teams ADD CONSTRAINT teams_manager_fk
        FOREIGN KEY (manager_id) REFERENCES users(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    department      TEXT,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    allocated_hours INTEGER NOT NULL CHECK (allocated_hours >= 0),
    budget          NUMERIC(14, 2) CHECK (budget IS NULL OR budget >= 0),
    manager_id      UUID NOT NULL REFERENCES users(id),
    status          project_status NOT NULL DEFAULT 'active',
    is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at     TIMESTAMPTZ,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT project_dates CHECK (end_date > start_date)
);

CREATE TABLE IF NOT EXISTS project_teams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_id     UUID NOT NULL REFERENCES teams(id),
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, team_id)
);

-- Deliverables = the "milestones" of the data-object spec.
CREATE TABLE IF NOT EXISTS deliverables (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    seq_no       INTEGER NOT NULL,
    name         TEXT NOT NULL,
    goal         TEXT,
    deliverables TEXT,
    start_date   DATE NOT NULL,
    end_date     DATE NOT NULL,
    status       deliverable_status NOT NULL DEFAULT 'planned',
    completed_at TIMESTAMPTZ,
    is_archived  BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, seq_no),
    CONSTRAINT deliverable_dates CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS deliverable_assignees (
    deliverable_id UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id),
    PRIMARY KEY (deliverable_id, user_id)
);

CREATE TABLE IF NOT EXISTS deliverable_dependencies (
    deliverable_id UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
    depends_on_id  UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
    PRIMARY KEY (deliverable_id, depends_on_id),
    CONSTRAINT no_self_dependency CHECK (deliverable_id <> depends_on_id)
);

-- Planned resource allocation: what share of a person's time goes to a project.
CREATE TABLE IF NOT EXISTS allocations (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id),
    allocation_percent INTEGER NOT NULL CHECK (allocation_percent BETWEEN 1 AND 100),
    start_date         DATE NOT NULL,
    end_date           DATE NOT NULL,
    role_on_project    TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT allocation_dates CHECK (end_date >= start_date)
);

-- Actual effort.
CREATE TABLE IF NOT EXISTS time_entries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    deliverable_id UUID REFERENCES deliverables(id) ON DELETE SET NULL,
    user_id        UUID NOT NULL REFERENCES users(id),
    work_date      DATE NOT NULL,
    hours          NUMERIC(5, 2) NOT NULL CHECK (hours > 0 AND hours <= 24),
    note           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Budget consumption.
CREATE TABLE IF NOT EXISTS expenses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category    TEXT NOT NULL,
    description TEXT,
    amount      NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    spent_on    DATE NOT NULL,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID REFERENCES users(id),
    action      audit_action NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   UUID,
    changes     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log is append-only.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(manager_id);
CREATE INDEX IF NOT EXISTS idx_project_teams_team ON project_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_project ON deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_allocations_user ON allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_allocations_project ON allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project ON expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
