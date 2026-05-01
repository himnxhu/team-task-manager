const state = {
  token: localStorage.getItem("ttm_token"),
  user: JSON.parse(localStorage.getItem("ttm_user") || "null"),
  view: "dashboard",
  authMode: "login",
  users: [],
  projects: [],
  tasks: [],
  dashboard: null,
  selectedProjectId: null,
  projectMembers: {}
};

const app = document.querySelector("#app");

const icons = {
  dashboard: "layout-dashboard",
  projects: "folder-kanban",
  tasks: "list-checks",
  team: "users",
  logout: "log-out",
  plus: "plus",
  save: "save",
  refresh: "refresh-cw"
};

function icon(name, size = 18) {
  return `<i data-lucide="${name}" style="width:${size}px;height:${size}px"></i>`;
}

function hydrateIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function setSession(payload) {
  state.token = payload.token;
  state.user = payload.user;
  localStorage.setItem("ttm_token", payload.token);
  localStorage.setItem("ttm_user", JSON.stringify(payload.user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  localStorage.removeItem("ttm_token");
  localStorage.removeItem("ttm_user");
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

function toast(message) {
  const existing = document.querySelector(".alert");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = "alert";
  el.textContent = message;
  const host = document.querySelector(".main") || document.querySelector(".auth-box");
  if (host) host.prepend(el);
  setTimeout(() => el.remove(), 4000);
}

function fmtDate(value) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusLabel(status) {
  return { todo: "To do", in_progress: "In progress", done: "Done" }[status] || status;
}

function isOverdue(task) {
  if (!task.due_date || task.status === "done") return false;
  const due = new Date(task.due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function renderAuth() {
  app.innerHTML = `
    <section class="auth-shell">
      <div class="auth-visual">
        <div class="brand-row">${icon("folder-kanban")} Team Task Manager</div>
        <div>
          <h1>Projects, ownership, and progress in one workspace.</h1>
          <p>Create teams, assign tasks, and track overdue work with admin and member access.</p>
        </div>
      </div>
      <div class="auth-panel">
        <div class="auth-box">
          <h2>${state.authMode === "login" ? "Log in" : "Create account"}</h2>
          <p>The first account becomes an Admin. New accounts start as Members.</p>
          <div class="tabs">
            <button class="tab ${state.authMode === "login" ? "active" : ""}" data-auth-mode="login">Login</button>
            <button class="tab ${state.authMode === "signup" ? "active" : ""}" data-auth-mode="signup">Signup</button>
          </div>
          <form id="authForm">
            <label class="${state.authMode === "login" ? "hidden" : ""}">Name<input name="name" autocomplete="name" /></label>
            <label>Email<input name="email" type="email" autocomplete="email" required /></label>
            <label>Password<input name="password" type="password" autocomplete="${state.authMode === "login" ? "current-password" : "new-password"}" required minlength="6" /></label>
            <button class="primary" type="submit">${icon("log-in")} ${state.authMode === "login" ? "Login" : "Signup"}</button>
          </form>
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      renderAuth();
    });
  });

  document.querySelector("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (state.authMode === "login") delete payload.name;
    try {
      const data = await api(`/api/auth/${state.authMode}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setSession(data);
      await loadData();
      renderApp();
    } catch (error) {
      toast(error.message);
    }
  });

  hydrateIcons();
}

async function loadData() {
  const [dashboard, users, projects, tasks] = await Promise.all([
    api("/api/dashboard"),
    api("/api/users"),
    api("/api/projects"),
    api("/api/tasks")
  ]);
  state.dashboard = dashboard;
  state.users = users.users;
  state.projects = projects.projects;
  state.tasks = tasks.tasks;
  if (!state.selectedProjectId && state.projects[0]) state.selectedProjectId = state.projects[0].id;
}

function renderShell(content) {
  const nav = [
    ["dashboard", "Dashboard"],
    ["projects", "Projects"],
    ["tasks", "Tasks"],
    ["team", "Team"]
  ];
  app.innerHTML = `
    <section class="app-shell">
      <aside class="sidebar">
        <div class="brand-row">${icon("folder-kanban")} Team Task Manager</div>
        <div class="user-mini">
          <strong>${state.user.name}</strong>
          <span>${state.user.email}</span>
          <span class="role-pill">${state.user.role}</span>
        </div>
        <nav class="nav">
          ${nav.map(([id, label]) => `<button class="${state.view === id ? "active" : ""}" data-view="${id}">${icon(icons[id])}<span>${label}</span></button>`).join("")}
        </nav>
        <button class="danger-btn" id="logoutBtn">${icon(icons.logout)} Logout</button>
      </aside>
      <section class="main">
        <header class="topbar">
          <div class="section-title">
            <h2>${nav.find(([id]) => id === state.view)?.[1] || "Dashboard"}</h2>
            <p>${state.user.role === "admin" ? "Admin access can manage projects, teams, roles, and all tasks." : "Member access can work inside assigned projects."}</p>
          </div>
          <button class="ghost" id="refreshBtn">${icon(icons.refresh)} Refresh</button>
        </header>
        ${content}
      </section>
    </section>
  `;

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.view = button.dataset.view;
      if (state.view === "projects" && state.user.role === "admin" && state.selectedProjectId && !state.projectMembers[state.selectedProjectId]) {
        await loadProjectMembers(state.selectedProjectId);
      }
      renderApp();
    });
  });
  document.querySelector("#logoutBtn").addEventListener("click", () => {
    clearSession();
    renderAuth();
  });
  document.querySelector("#refreshBtn").addEventListener("click", async () => {
    await loadData();
    if (state.view === "projects" && state.selectedProjectId) await loadProjectMembers(state.selectedProjectId);
    renderApp();
  });
}

function renderDashboard() {
  const stats = state.dashboard?.stats || {};
  const statCards = [
    ["Total", stats.total || 0],
    ["To do", stats.todo || 0],
    ["In progress", stats.in_progress || 0],
    ["Done", stats.done || 0],
    ["Overdue", stats.overdue || 0]
  ];
  return `
    <div class="stats-grid">
      ${statCards.map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join("")}
    </div>
    <div class="two-col">
      <div class="panel">
        <h3>Overdue Tasks</h3>
        <div class="item-list">
          ${state.dashboard?.overdue?.length ? state.dashboard.overdue.map((task) => taskItem(task, false)).join("") : `<div class="empty">No overdue tasks.</div>`}
        </div>
      </div>
      <div class="panel">
        <h3>Recent Work</h3>
        <div class="item-list">
          ${state.tasks.slice(0, 8).map((task) => taskItem(task, true)).join("") || `<div class="empty">Create a project and add tasks to begin.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderProjects() {
  return `
    <div class="two-col">
      <div class="panel ${state.user.role !== "admin" ? "hidden" : ""}">
        <h3>New Project</h3>
        <form id="projectForm">
          <label>Project name<input name="name" required minlength="2" /></label>
          <label>Description<textarea name="description"></textarea></label>
          <button class="primary" type="submit">${icon(icons.plus)} Create</button>
        </form>
      </div>
      <div class="panel">
        <div class="section-head">
          <h3>Projects</h3>
          <span class="chip">${state.projects.length} total</span>
        </div>
        <div class="item-list">
          ${state.projects.map(projectItem).join("") || `<div class="empty">No projects available.</div>`}
        </div>
      </div>
    </div>
    ${state.user.role === "admin" ? renderMembershipEditor() : ""}
  `;
}

function projectItem(project) {
  const progress = project.task_count ? Math.round((project.done_count / project.task_count) * 100) : 0;
  return `
    <article class="item">
      <div class="item-title">
        <h4>${project.name}</h4>
        <button class="icon-btn" title="Select project" data-select-project="${project.id}">${icon("arrow-right")}</button>
      </div>
      <p>${project.description || "No description"}</p>
      <div class="meta">
        <span>${project.member_count} members</span>
        <span>${project.task_count} tasks</span>
        <span>${progress}% complete</span>
        <span>Owner: ${project.owner_name || "Admin"}</span>
      </div>
    </article>
  `;
}

function renderMembershipEditor() {
  const selected = state.projects.find((project) => project.id === Number(state.selectedProjectId));
  if (!selected) return "";
  const selectedMemberIds = new Set(state.projectMembers[selected.id] || []);
  return `
    <div class="panel" style="margin-top:16px">
      <div class="section-head">
        <h3>Project Team</h3>
        <select id="memberProjectSelect">
          ${state.projects.map((project) => `<option value="${project.id}" ${project.id === selected.id ? "selected" : ""}>${project.name}</option>`).join("")}
        </select>
      </div>
      <form id="membersForm">
        <div class="check-list">
          ${state.users.map((user) => `
            <label class="check-row">
              <input type="checkbox" name="memberIds" value="${user.id}" ${selectedMemberIds.has(user.id) ? "checked" : ""} />
              <span>${user.name} (${user.role})</span>
            </label>
          `).join("")}
        </div>
        <button class="primary" type="submit">${icon(icons.save)} Save team</button>
      </form>
    </div>
  `;
}

function renderTasks() {
  return `
    <div class="two-col">
      <div class="panel">
        <h3>New Task</h3>
        <form id="taskForm">
          <label>Title<input name="title" required minlength="2" /></label>
          <label>Description<textarea name="description"></textarea></label>
          <label>Project<select name="projectId" required>${state.projects.map((project) => `<option value="${project.id}">${project.name}</option>`).join("")}</select></label>
          <div class="form-row">
            <label>Assignee<select name="assigneeId"><option value="">Unassigned</option>${state.users.map((user) => `<option value="${user.id}">${user.name}</option>`).join("")}</select></label>
            <label>Priority<select name="priority"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></select></label>
          </div>
          <label>Due date<input type="date" name="dueDate" /></label>
          <button class="primary" type="submit">${icon(icons.plus)} Add task</button>
        </form>
      </div>
      <div class="panel">
        <div class="section-head">
          <h3>Tasks</h3>
          <select id="taskProjectFilter">
            <option value="">All projects</option>
            ${state.projects.map((project) => `<option value="${project.id}">${project.name}</option>`).join("")}
          </select>
        </div>
        <div class="item-list" id="taskList">
          ${state.tasks.map((task) => taskItem(task, true)).join("") || `<div class="empty">No tasks yet.</div>`}
        </div>
      </div>
    </div>
  `;
}

function taskItem(task, editable) {
  return `
    <article class="item">
      <div class="item-title">
        <h4>${task.title}</h4>
        <span class="chip ${task.status}">${statusLabel(task.status)}</span>
      </div>
      <div class="meta">
        <span>${task.project_name || "Project"}</span>
        <span>${task.assignee_name || "Unassigned"}</span>
        <span class="${isOverdue(task) ? "chip overdue" : ""}">${fmtDate(task.due_date)}</span>
        <span class="chip ${task.priority}">${task.priority}</span>
      </div>
      ${task.description ? `<p>${task.description}</p>` : ""}
      ${editable ? `
        <div class="actions">
          ${statusButton(task, "todo", "To do")}
          ${statusButton(task, "in_progress", "In progress")}
          ${statusButton(task, "done", "Done")}
        </div>
      ` : ""}
    </article>
  `;
}

function statusButton(task, status, label) {
  const active = task.status === status;
  return `
    <button
      class="ghost status-action ${active ? "active" : ""}"
      type="button"
      data-status="${task.id}:${status}"
      aria-pressed="${active}"
      ${active ? "disabled" : ""}
    >
      ${label}
    </button>
  `;
}

function renderTeam() {
  return `
    <div class="panel">
      <div class="section-head">
        <h3>Users</h3>
        <span class="chip">${state.users.length} people</span>
      </div>
      <div class="item-list">
        ${state.users.map((user) => `
          <article class="item">
            <div class="item-title">
              <h4>${user.name}</h4>
              <span class="chip">${user.role}</span>
            </div>
            <div class="meta"><span>${user.email}</span></div>
            ${state.user.role === "admin" && user.id !== state.user.id ? `
              <div class="actions">
                <button class="ghost" data-role="${user.id}:member">Member</button>
                <button class="ghost" data-role="${user.id}:admin">Admin</button>
              </div>
            ` : ""}
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function bindHandlers() {
  const projectForm = document.querySelector("#projectForm");
  if (projectForm) {
    projectForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api("/api/projects", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(projectForm).entries())) });
        await loadData();
        renderApp();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  document.querySelectorAll("[data-select-project]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedProjectId = Number(button.dataset.selectProject);
      await loadProjectMembers(state.selectedProjectId);
      renderApp();
    });
  });

  const memberProjectSelect = document.querySelector("#memberProjectSelect");
  if (memberProjectSelect) {
    memberProjectSelect.addEventListener("change", async () => {
      state.selectedProjectId = Number(memberProjectSelect.value);
      await loadProjectMembers(state.selectedProjectId);
      renderApp();
    });
  }

  const membersForm = document.querySelector("#membersForm");
  if (membersForm) {
    membersForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const memberIds = Array.from(membersForm.querySelectorAll("input[name='memberIds']:checked")).map((input) => Number(input.value));
      try {
        await api(`/api/projects/${state.selectedProjectId}/members`, { method: "PUT", body: JSON.stringify({ memberIds }) });
        await loadData();
        await loadProjectMembers(state.selectedProjectId);
        renderApp();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  const taskForm = document.querySelector("#taskForm");
  if (taskForm) {
    taskForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(taskForm).entries());
      payload.assigneeId = payload.assigneeId ? Number(payload.assigneeId) : null;
      payload.projectId = Number(payload.projectId);
      payload.dueDate = payload.dueDate || null;
      try {
        await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
        await loadData();
        renderApp();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  const taskProjectFilter = document.querySelector("#taskProjectFilter");
  if (taskProjectFilter) {
    taskProjectFilter.addEventListener("change", async () => {
      const query = taskProjectFilter.value ? `?projectId=${taskProjectFilter.value}` : "";
      const data = await api(`/api/tasks${query}`);
      state.tasks = data.tasks;
      document.querySelector("#taskList").innerHTML = state.tasks.map((task) => taskItem(task, true)).join("") || `<div class="empty">No tasks match this filter.</div>`;
      bindStatusButtons();
      hydrateIcons();
    });
  }

  bindStatusButtons();

  document.querySelectorAll("[data-role]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [id, role] = button.dataset.role.split(":");
      try {
        await api(`/api/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
        await loadData();
        renderApp();
      } catch (error) {
        toast(error.message);
      }
    });
  });
}

function bindStatusButtons() {
  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [id, status] = button.dataset.status.split(":");
      try {
        button.disabled = true;
        await api(`/api/tasks/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
        await loadData();
        renderApp();
      } catch (error) {
        button.disabled = false;
        toast(error.message);
      }
    });
  });
}

async function loadProjectMembers(projectId) {
  if (!projectId) return;
  const data = await api(`/api/projects/${projectId}/members`);
  state.projectMembers[projectId] = data.members.map((member) => member.id);
}

async function renderApp() {
  if (!state.token) {
    renderAuth();
    return;
  }

  let content = "";
  if (state.view === "dashboard") content = renderDashboard();
  if (state.view === "projects") content = renderProjects();
  if (state.view === "tasks") content = renderTasks();
  if (state.view === "team") content = renderTeam();
  renderShell(content);
  bindHandlers();
  hydrateIcons();
}

(async function boot() {
  if (!state.token) {
    renderAuth();
    return;
  }
  try {
    const me = await api("/api/me");
    state.user = me.user;
    await loadData();
    if (state.selectedProjectId) await loadProjectMembers(state.selectedProjectId);
    renderApp();
  } catch (error) {
    clearSession();
    renderAuth();
  }
})();
