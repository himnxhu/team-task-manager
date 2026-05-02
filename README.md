# Team Task Manager

A full-stack team task management application for organizing projects, assigning work, tracking task progress, and reviewing overdue items from a role-aware dashboard.

The app includes a Node.js/Express API, a PostgreSQL database, JWT authentication, role-based access control, and a vanilla HTML/CSS/JavaScript frontend.

## Features

- User signup and login with JWT-based sessions
- Secure password hashing with `bcryptjs`
- First registered user is automatically assigned the `admin` role
- Later registered users are assigned the `member` role
- Startup role enforcement keeps only the first user as admin
- Admin project creation, editing, deletion, and member assignment
- Automatic project owner membership
- Task creation, editing, deletion, assignment, priority, due date, and status tracking
- Member access to visible projects and tasks
- Member task status updates for accessible work
- Dashboard statistics for total, to-do, in-progress, done, and overdue tasks
- Overdue task list ordered by due date
- Project cards with member count, task count, and completion progress
- Team view showing users and project membership
- Confirmation dialogs for destructive actions
- Loading states, toast errors, responsive layout, and Lucide icons
- PostgreSQL schema created automatically on server startup
- Render Blueprint deployment through `render.yaml`

## Tech Stack

- **Frontend:** HTML, CSS, vanilla JavaScript
- **Backend:** Node.js, Express
- **Database:** PostgreSQL
- **Authentication:** JWT, bcrypt password hashing
- **Validation:** Zod
- **Security middleware:** Helmet, CORS
- **Icons:** Lucide via CDN
- **Deployment:** Render web service with managed PostgreSQL

## Project Structure

```text
.
├── server.js              # Express API, auth, validation, database setup, routes
├── package.json           # Node scripts, dependencies, Node engine
├── package-lock.json      # Locked dependency versions
├── render.yaml            # Render Blueprint configuration
├── .env.example           # Example local environment variables
├── .gitignore             # Ignored local files
└── static/
    ├── index.html         # Single-page app shell
    ├── app.js             # Frontend state, API calls, views, forms, handlers
    ├── styles.css         # Responsive UI styling
    └── favicon.svg        # App favicon
```

## Requirements

- Node.js 20 or newer
- npm
- PostgreSQL

## Environment Variables

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Available variables:

```text
PORT=3000
DATABASE_URL=postgresql://postgres:your_postgres_password@localhost:5432/team_task_manager
JWT_SECRET=replace-with-a-long-random-secret
DB_SSL=false
```

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Port used by the Express server. Defaults to `3000`. |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by the `pg` package. |
| `JWT_SECRET` | Yes in production | Secret used to sign JWT sessions. Use a long random value. |
| `DB_SSL` | No | Set to `true` when the database requires SSL. Local PostgreSQL usually uses `false`. |

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local PostgreSQL database named `team_task_manager`.

Using pgAdmin, right-click **Databases**, select **Create > Database**, and use:

```text
team_task_manager
```

3. Update `.env` with your PostgreSQL password:

```text
DATABASE_URL=postgresql://postgres:<your_postgres_password>@localhost:5432/team_task_manager
```

4. Start the application:

```bash
npm start
```

The app runs at:

```text
http://localhost:3000
```

The server automatically creates the required database tables and indexes during startup.

## Available Scripts

```bash
npm start
```

Starts the Express server with `node server.js`.

```bash
npm run dev
```

Runs the same server command. There is no separate hot-reload tool configured.

## Roles and Permissions

| Capability | Admin | Member |
| --- | --- | --- |
| Create account and log in | Yes | Yes |
| View dashboard | Yes | Yes, scoped to visible work |
| View users | Yes | Yes |
| View projects | All projects | Assigned/member projects |
| Create projects | Yes | No |
| Edit projects | Yes | No |
| Delete projects | Yes | No |
| Manage project members | Yes | No |
| View project members | Yes | For accessible projects |
| Create tasks | Yes | No |
| Edit tasks | Yes | No |
| Delete tasks | Yes | No |
| Update task status | Yes | For accessible tasks |

## Database Schema

The database is initialized in `server.js` with these tables:

- `users`: account details, unique email, hashed password, role, created timestamp
- `projects`: project name, description, owner, created timestamp, updated timestamp
- `project_members`: many-to-many project membership table
- `tasks`: title, description, project, creator, assignee, status, priority, due date, timestamps

Important constraints:

- `users.email` is unique
- `users.role` must be `admin` or `member`
- `tasks.status` must be `todo`, `in_progress`, or `done`
- `tasks.priority` must be `low`, `medium`, or `high`
- Deleting a project cascades to project membership and tasks
- Deleting a user sets created/assigned task references to `NULL` where applicable

Indexes:

- `idx_tasks_project_id`
- `idx_tasks_assignee_id`

## API Reference

All protected routes require an `Authorization` header:

```text
Authorization: Bearer <jwt-token>
```

### Health

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | No | Checks database connectivity and returns `{ "status": "ok" }`. |

### Authentication

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/signup` | No | Creates a user and returns a token plus public user data. |
| `POST` | `/api/auth/login` | No | Logs in an existing user and returns a token plus public user data. |
| `GET` | `/api/me` | Yes | Returns the current authenticated user. |

Signup body:

```json
{
  "name": "Admin User",
  "email": "admin@example.com",
  "password": "password123"
}
```

Login body:

```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

### Users

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/users` | Yes | Lists users ordered by name. |

### Projects

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/projects` | Yes | Lists visible projects with owner, member count, task count, and done count. |
| `POST` | `/api/projects` | Admin | Creates a project. |
| `PATCH` | `/api/projects/:id` | Admin | Updates a project name and description. |
| `DELETE` | `/api/projects/:id` | Admin | Deletes a project. |
| `GET` | `/api/projects/:id/members` | Yes | Lists project members for accessible projects. |
| `PUT` | `/api/projects/:id/members` | Admin | Replaces project members. The project owner is always retained. |

Project body:

```json
{
  "name": "Website Launch",
  "description": "Plan and deliver the new marketing website."
}
```

Project members body:

```json
{
  "memberIds": [1, 2, 3]
}
```

### Tasks

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/tasks` | Yes | Lists visible tasks. Supports optional `projectId` query filter. |
| `POST` | `/api/tasks` | Admin | Creates a task. |
| `PATCH` | `/api/tasks/:id` | Admin | Updates task details. |
| `DELETE` | `/api/tasks/:id` | Admin | Deletes a task. |
| `PATCH` | `/api/tasks/:id/status` | Yes | Updates task status. Members can update accessible tasks. |

Task body:

```json
{
  "title": "Create landing page copy",
  "description": "Draft copy for the hero and feature sections.",
  "projectId": 1,
  "assigneeId": 2,
  "dueDate": "2026-05-15",
  "priority": "high"
}
```

Status body:

```json
{
  "status": "in_progress"
}
```

Allowed values:

- Task status: `todo`, `in_progress`, `done`
- Task priority: `low`, `medium`, `high`

### Dashboard

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/dashboard` | Yes | Returns task statistics and up to 8 overdue tasks. |

## Frontend Views

- **Authentication:** Login and signup tabs. The first signup becomes admin.
- **Dashboard:** Summary cards, recent work, completed work, and overdue work.
- **Projects:** Project list, selected project details, progress, and admin project management.
- **Tasks:** Task list, project filtering, status controls, and admin task management.
- **Team:** User list and project membership overview.

The frontend stores the JWT and public user data in `localStorage` under:

```text
ttm_token
ttm_user
```

## Render Deployment

This repository includes `render.yaml` for Render Blueprint deployment.

1. Push the repository to GitHub.
2. In Render, choose **New > Blueprint**.
3. Connect the GitHub repository.
4. Select the branch you want to deploy.
5. Review the generated web service and PostgreSQL database.
6. Deploy the Blueprint.

The Blueprint defines:

- Node web service named `team-task-manager`
- Managed PostgreSQL database named `team-task-manager-db`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`
- Generated `JWT_SECRET`
- `DATABASE_URL` sourced from the Render database

If your Render database requires SSL, set:

```text
DB_SSL=true
```

## Demo Flow

1. Sign up as the first user to create the admin account.
2. Create a project.
3. Sign up one or more member accounts.
4. Log back in as admin.
5. Assign members to the project.
6. Create tasks with priorities, assignees, and due dates.
7. Edit a project or task to show admin management.
8. Log in as a member.
9. Update task status from to-do to in-progress or done.
10. Open the dashboard to show totals and overdue work.

## Validation and Error Handling

- Request bodies are validated with Zod.
- Duplicate signup email returns a conflict response.
- Missing or invalid JWT returns an authentication error.
- Non-admin writes to admin-only routes return a forbidden response.
- Invalid project/task/member references return validation, forbidden, or not found responses depending on the case.
- Unknown API routes under `/api` return `API route not found`.

## Security Notes

- Do not commit `.env`.
- Use a long, random `JWT_SECRET` in production.
- Passwords are stored as bcrypt hashes, not plain text.
- Helmet is enabled with a content security policy that allows the local app and Lucide CDN script.
- Set `DB_SSL=true` only when your database provider requires SSL.

## Submission Checklist

- Live URL: add your deployed Render URL
- GitHub repository URL: add your repository URL
- README: included
- Demo video: record a 2-5 minute walkthrough using the demo flow above
