# Team Task Manager

A full-stack project and task management app with authentication, project teams, role-based access control, task assignment, status tracking, and a dashboard for work status and overdue tasks.

## Features

- Signup and login with JWT authentication
- First registered user becomes `admin`; later users become `member`
- Admins can create projects, manage project members, and change user roles
- Members can view assigned projects and update task progress
- Task creation with assignee, priority, due date, and status
- Dashboard with total, to-do, in-progress, done, and overdue task counts
- PostgreSQL database with relationships and constraints
- Railway-ready single-service deployment

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js, Express
- Database: PostgreSQL
- Auth: bcrypt password hashing, JWT sessions
- Validation: Zod

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from the example:

```bash
cp .env.example .env
```

3. Set `DATABASE_URL` to a PostgreSQL database.

4. Start the app:

```bash
npm start
```

The app runs at `http://localhost:3000`.

## Railway Deployment

1. Push this repository to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Add a PostgreSQL service in Railway.
4. In the web service variables, set:

```text
DATABASE_URL=<Railway PostgreSQL connection string>
JWT_SECRET=<long random secret>
DB_SSL=false
```

5. Deploy. Railway will run `npm start`.

The server creates the required tables automatically during startup.

## API Overview

- `POST /api/auth/signup` - create account
- `POST /api/auth/login` - login
- `GET /api/me` - current user
- `GET /api/users` - list users
- `PATCH /api/users/:id/role` - admin role update
- `GET /api/projects` - visible projects
- `POST /api/projects` - admin project creation
- `GET /api/projects/:id/members` - project members
- `PUT /api/projects/:id/members` - admin team assignment
- `GET /api/tasks` - visible tasks
- `POST /api/tasks` - create task
- `PATCH /api/tasks/:id/status` - update task status
- `GET /api/dashboard` - task statistics and overdue tasks

## Demo Flow

1. Sign up as the first user to become Admin.
2. Create a project.
3. Sign up one or more Member users.
4. As Admin, assign members to the project.
5. Create tasks, assign them to members, and set due dates.
6. Log in as a Member and update task status.
7. Show the dashboard counts and overdue section.

## Submission Checklist

- Live URL: add your deployed Railway URL
- GitHub repo: add your repository URL
- README: included
- Demo video: record a 2-5 minute walkthrough using the demo flow above
