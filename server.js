require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { z } = require("zod");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "development-only-secret-change-me";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn("DATABASE_URL is not set. Add PostgreSQL connection details before starting in production.");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "https://unpkg.com"],
      "img-src": ["'self'", "data:", "https://images.unsplash.com"],
      "connect-src": ["'self'"]
    }
  }
}));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "static")));

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120).transform((value) => value.toLowerCase()),
  password: z.string().min(6).max(120)
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1)
});

const projectSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(600).optional().default("")
});

const projectMembersSchema = z.object({
  memberIds: z.array(z.coerce.number().int().positive()).max(50).default([])
});

const taskSchema = z.object({
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(1000).optional().default(""),
  projectId: z.coerce.number().int().positive(),
  assigneeId: z.coerce.number().int().positive().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium")
});

const statusSchema = z.object({
  status: z.enum(["todo", "in_progress", "done"])
});

const roleSchema = z.object({
  role: z.enum(["admin", "member"])
});

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.created_at
  };
}

function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join(", ");
    const error = new Error(message || "Invalid request body");
    error.status = 400;
    throw error;
  }
  return result.data;
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(120) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(140) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
      priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
      due_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id);
  `);
}

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query("SELECT id, name, email, role, created_at FROM users WHERE id = $1", [decoded.id]);
    if (!rows[0]) {
      return res.status(401).json({ message: "Invalid session" });
    }
    req.user = rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

async function canAccessProject(user, projectId) {
  if (user.role === "admin") return true;
  const { rows } = await pool.query(
    "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, user.id]
  );
  return Boolean(rows[0]);
}

app.get("/api/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/signup", async (req, res, next) => {
  try {
    const data = parseBody(signupSchema, req.body);
    const { rows: countRows } = await pool.query("SELECT COUNT(*)::int AS count FROM users");
    const role = countRows[0].count === 0 ? "admin" : "member";
    const hash = await bcrypt.hash(data.password, 12);
    const { rows } = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at",
      [data.name, data.email, hash, role]
    );
    const user = rows[0];
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    if (error.code === "23505") error = Object.assign(new Error("Email is already registered"), { status: 409 });
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const data = parseBody(loginSchema, req.body);
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [data.email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(data.password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get("/api/users", authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT id, name, email, role, created_at FROM users ORDER BY name ASC");
    res.json({ users: rows.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/users/:id/role", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { role } = parseBody(roleSchema, req.body);
    const { rows } = await pool.query(
      "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role, created_at",
      [role, id]
    );
    if (!rows[0]) return res.status(404).json({ message: "User not found" });
    res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects", authenticate, async (req, res, next) => {
  try {
    const params = [];
    const visibility = req.user.role === "admin" ? "" : "WHERE pm.user_id = $1";
    if (req.user.role !== "admin") params.push(req.user.id);
    const { rows } = await pool.query(`
      SELECT p.*,
        u.name AS owner_name,
        COUNT(DISTINCT pm_all.user_id)::int AS member_count,
        COUNT(DISTINCT t.id)::int AS task_count,
        COUNT(DISTINCT CASE WHEN t.status = 'done' THEN t.id END)::int AS done_count
      FROM projects p
      JOIN users u ON u.id = p.owner_id
      LEFT JOIN project_members pm ON pm.project_id = p.id
      LEFT JOIN project_members pm_all ON pm_all.project_id = p.id
      LEFT JOIN tasks t ON t.project_id = p.id
      ${visibility}
      GROUP BY p.id, u.name
      ORDER BY p.created_at DESC
    `, params);
    res.json({ projects: rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", authenticate, requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const data = parseBody(projectSchema, req.body);
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO projects (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *",
      [data.name, data.description, req.user.id]
    );
    await client.query("INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [rows[0].id, req.user.id]);
    await client.query("COMMIT");
    res.status(201).json({ project: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/projects/:id/members", authenticate, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    if (!(await canAccessProject(req.user, projectId))) return res.status(403).json({ message: "Project access denied" });
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, u.created_at
      FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = $1
      ORDER BY u.name ASC
    `, [projectId]);
    res.json({ members: rows.map(publicUser) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/projects/:id/members", authenticate, requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const projectId = Number(req.params.id);
    const { memberIds } = parseBody(projectMembersSchema, req.body);
    const { rows: projectRows } = await client.query("SELECT owner_id FROM projects WHERE id = $1", [projectId]);
    if (!projectRows[0]) return res.status(404).json({ message: "Project not found" });
    const ids = Array.from(new Set([...memberIds, projectRows[0].owner_id]));
    await client.query("BEGIN");
    await client.query("DELETE FROM project_members WHERE project_id = $1", [projectId]);
    for (const userId of ids) {
      await client.query("INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [projectId, userId]);
    }
    await client.query("COMMIT");
    res.json({ memberIds: ids });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/tasks", authenticate, async (req, res, next) => {
  try {
    const projectId = req.query.projectId ? Number(req.query.projectId) : null;
    const params = [];
    const where = [];
    if (req.user.role !== "admin") {
      params.push(req.user.id);
      where.push(`(t.assignee_id = $${params.length} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $${params.length}))`);
    }
    if (projectId) {
      params.push(projectId);
      where.push(`t.project_id = $${params.length}`);
    }
    const { rows } = await pool.query(`
      SELECT t.*, p.name AS project_name, assignee.name AS assignee_name, creator.name AS creator_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users assignee ON assignee.id = t.assignee_id
      LEFT JOIN users creator ON creator.id = t.creator_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY
        CASE WHEN t.status = 'done' THEN 1 ELSE 0 END,
        t.due_date ASC NULLS LAST,
        t.created_at DESC
    `, params);
    res.json({ tasks: rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks", authenticate, async (req, res, next) => {
  try {
    const data = parseBody(taskSchema, req.body);
    if (!(await canAccessProject(req.user, data.projectId))) return res.status(403).json({ message: "Project access denied" });
    if (data.assigneeId) {
      const { rows: memberRows } = await pool.query(
        "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
        [data.projectId, data.assigneeId]
      );
      if (!memberRows[0]) return res.status(400).json({ message: "Assignee must be a project member" });
    }
    const { rows } = await pool.query(`
      INSERT INTO tasks (title, description, project_id, creator_id, assignee_id, due_date, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [data.title, data.description, data.projectId, req.user.id, data.assigneeId || null, data.dueDate || null, data.priority]);
    res.status(201).json({ task: rows[0] });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tasks/:id/status", authenticate, async (req, res, next) => {
  try {
    const taskId = Number(req.params.id);
    const { status } = parseBody(statusSchema, req.body);
    const { rows: existingRows } = await pool.query("SELECT * FROM tasks WHERE id = $1", [taskId]);
    const task = existingRows[0];
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (req.user.role !== "admin" && task.assignee_id !== req.user.id && !(await canAccessProject(req.user, task.project_id))) {
      return res.status(403).json({ message: "Task access denied" });
    }
    const { rows } = await pool.query(
      "UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [status, taskId]
    );
    res.json({ task: rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard", authenticate, async (req, res, next) => {
  try {
    const visibility = req.user.role === "admin"
      ? ""
      : "WHERE t.assignee_id = $1 OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $1)";
    const params = req.user.role === "admin" ? [] : [req.user.id];
    const { rows: statsRows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(CASE WHEN status = 'todo' THEN 1 END)::int AS todo,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::int AS in_progress,
        COUNT(CASE WHEN status = 'done' THEN 1 END)::int AS done,
        COUNT(CASE WHEN due_date < CURRENT_DATE AND status != 'done' THEN 1 END)::int AS overdue
      FROM tasks t
      ${visibility}
    `, params);
    const { rows: overdueRows } = await pool.query(`
      SELECT t.id, t.title, t.status, t.priority, t.due_date, p.name AS project_name, u.name AS assignee_name
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u ON u.id = t.assignee_id
      ${visibility ? `${visibility} AND` : "WHERE"} t.due_date < CURRENT_DATE AND t.status != 'done'
      ORDER BY t.due_date ASC
      LIMIT 8
    `, params);
    res.json({ stats: statsRows[0], overdue: overdueRows });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ message: "API route not found" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "static", "index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ message: error.message || "Server error" });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Team Task Manager running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });
