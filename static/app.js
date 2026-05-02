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
  editingProjectId: null,
  editingTaskId: null,
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
  refresh: "refresh-cw",
  edit: "pencil",
  trash: "trash-2",
  close: "x",
  users: "users",
  calendar: "calendar-days"
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

function confirmDialog({ title, message, confirmText = "Delete" }) {
  return new Promise((resolve) => {
    const existing = document.querySelector(".confirm-backdrop");
    if (existing) existing.remove();

    const backdrop = document.createElement("div");
    backdrop.className = "confirm-backdrop";
    backdrop.innerHTML = `
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
        <div class="confirm-icon">${icon(icons.trash, 20)}</div>
        <div class="confirm-copy">
          <h3 id="confirmTitle">${title}</h3>
          <p>${message}</p>
        </div>
        <div class="confirm-actions">
          <button class="ghost" type="button" data-confirm-cancel>Cancel</button>
          <button class="danger-btn" type="button" data-confirm-ok>${icon(icons.trash, 16)} ${confirmText}</button>
        </div>
      </section>
    `;

    const close = (answer) => {
      document.removeEventListener("keydown", onKeydown);
      backdrop.remove();
      resolve(answer);
    };

    const onKeydown = (event) => {
      if (event.key === "Escape") close(false);
    };

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close(false);
    });
    backdrop.querySelector("[data-confirm-cancel]").addEventListener("click", () => close(false));
    backdrop.querySelector("[data-confirm-ok]").addEventListener("click", () => close(true));
    document.addEventListener("keydown", onKeydown);
    document.body.append(backdrop);
    hydrateIcons();
    backdrop.querySelector("[data-confirm-cancel]").focus();
  });
}

function fmtDate(value) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function inputDate(value) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function projectById(id) {
  return state.projects.find((project) => project.id === Number(id));
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
            <button class="tab ${state.authMode === "login" ? "active" : ""}" type="button" data-auth-mode="login">Login</button>
            <button class="tab ${state.authMode === "signup" ? "active" : ""}" type="button" data-auth-mode="signup">Signup</button>
          </div>
          <form id="authForm">
            <label class="${state.authMode === "login" ? "hidden" : ""}">Name<input name="name" autocomplete="name" /></label>
            <label>Email<input name="email" type="email" autocomplete="email" required /></label>
            <label>Password<input name="password" type="password" autocomplete="${state.authMode === "login" ? "current-password" : "new-password"}" required minlength="6" /></label>
            <button class="primary auth-submit" type="submit">
              <span class="button-spinner" aria-hidden="true"></span>
              <span class="button-ready">${icon("log-in")} ${state.authMode === "login" ? "Login" : "Signup"}</span>
              <span class="button-loading">Loading</span>
            </button>
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
    const authForm = event.currentTarget;
    const submitButton = authForm.querySelector(".auth-submit");
    const form = new FormData(authForm);
    const payload = Object.fromEntries(form.entries());
    authForm.classList.add("is-loading");
    authForm.querySelectorAll("input, button").forEach((control) => {
      control.disabled = true;
    });
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
      authForm.classList.remove("is-loading");
      authForm.querySelectorAll("input, button").forEach((control) => {
        control.disabled = false;
      });
      submitButton?.focus();
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
  if (state.selectedProjectId && !projectById(state.selectedProjectId)) {
    state.selectedProjectId = null;
  }
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
          ${nav.map(([id, label]) => `<button class="${state.view === id ? "active" : ""}" type="button" data-view="${id}">${icon(icons[id])}<span>${label}</span></button>`).join("")}
        </nav>
        <button class="danger-btn" id="logoutBtn" type="button">${icon(icons.logout)} Logout</button>
      </aside>
      <section class="main">
        <header class="topbar">
          <div class="section-title">
            <h2>${nav.find(([id]) => id === state.view)?.[1] || "Dashboard"}</h2>
            <p>${state.user.role === "admin" ? "Admin access can manage projects, teams, and all tasks." : "Member access can work inside assigned projects."}</p>
          </div>
          <button class="ghost" id="refreshBtn" type="button">${icon(icons.refresh)} Refresh</button>
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
      if (state.view === "team" && state.user.role !== "admin") {
        await loadVisibleProjectMembers();
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
  const recentTasks = state.tasks.slice(0, 8);
  const completedTasks = state.tasks.filter((task) => task.status === "done").slice(0, 8);
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
    <div class="dashboard-sections">
      <div class="panel">
        <h3>Overdue Tasks</h3>
        <div class="item-list">
          ${state.dashboard?.overdue?.length ? state.dashboard.overdue.map((task) => taskItem(task, false)).join("") : `<div class="empty">No overdue tasks.</div>`}
        </div>
      </div>
      <div class="panel">
        <h3>Recent Work</h3>
        <div class="item-list">
          ${recentTasks.map((task) => taskItem(task, state.user.role === "admin")).join("") || `<div class="empty">Create a project and add tasks to begin.</div>`}
        </div>
      </div>
      <div class="panel">
        <h3>Completed</h3>
        <div class="item-list">
          ${completedTasks.map((task) => taskItem(task, state.user.role === "admin")).join("") || `<div class="empty">No completed tasks yet.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderProjects() {
  const selected = projectById(state.selectedProjectId);
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
    ${selected ? renderProjectDetail(selected) : ""}
    ${state.user.role === "admin" ? renderMembershipEditor() : ""}
  `;
}

function projectItem(project) {
  const progress = project.task_count ? Math.round((project.done_count / project.task_count) * 100) : 0;
  const selected = project.id === Number(state.selectedProjectId);
  return `
    <article class="item project-card ${selected ? "selected-item" : ""}" role="button" tabindex="0" data-select-project="${project.id}">
      <div class="item-title">
        <h4>${project.name}</h4>
        <span class="icon-btn" aria-hidden="true">${icon("arrow-right")}</span>
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

function renderProjectDetail(project) {
  const members = state.projectMembers[project.id] || [];
  const projectTasks = state.tasks.filter((task) => task.project_id === project.id);
  const canManage = state.user.role === "admin";
  return `
    <div class="panel project-detail">
      <div class="section-head">
        <div>
          <h3>${project.name}</h3>
          <p>${project.description || "No description"}</p>
        </div>
        ${canManage ? `
          <div class="actions">
            <button class="ghost" type="button" data-edit-project="${project.id}">${icon(icons.edit)} Edit</button>
            <button class="danger-btn" type="button" data-delete-project="${project.id}">${icon(icons.trash)} Delete</button>
          </div>
        ` : ""}
      </div>
      ${canManage && state.editingProjectId === project.id ? `
        <form id="projectEditForm" class="edit-form">
          <label>Project name<input name="name" required minlength="2" value="${project.name}" /></label>
          <label>Description<textarea name="description">${project.description || ""}</textarea></label>
          <div class="actions">
            <button class="primary" type="submit">${icon(icons.save)} Save</button>
            <button class="ghost" type="button" data-cancel-project-edit>${icon(icons.close)} Cancel</button>
          </div>
        </form>
      ` : ""}
      <div class="detail-grid">
        <div>
          <h4>Members Assigned</h4>
          <div class="mini-list">
            ${members.length ? members.map((member) => `<span>${member.name}</span>`).join("") : `<span>No members assigned.</span>`}
          </div>
        </div>
        <div>
          <h4>Project Tasks</h4>
          <div class="item-list">
            ${projectTasks.length ? projectTasks.map((task) => taskItem(task, true)).join("") : `<div class="empty">No tasks in this project.</div>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderMembershipEditor() {
  const selected = projectById(state.selectedProjectId);
  if (!selected) return "";
  const selectedMemberIds = new Set((state.projectMembers[selected.id] || []).map((member) => member.id));
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
              <span>${user.name}</span>
            </label>
          `).join("")}
        </div>
        <button class="primary" type="submit">${icon(icons.save)} Save team</button>
      </form>
    </div>
  `;
}

function renderTasks() {
  const canCreateTasks = state.user.role === "admin";
  const selectedProject = projectById(state.selectedProjectId);
  const visibleTasks = selectedProject
    ? state.tasks.filter((task) => task.project_id === selectedProject.id)
    : state.tasks;
  return `
    <div class="two-col">
      <div class="panel ${canCreateTasks ? "" : "hidden"}">
        <h3>New Task</h3>
        <form id="taskForm">
          <label>Title<input name="title" required minlength="2" /></label>
          <label>Description<textarea name="description"></textarea></label>
          <label>Project<select name="projectId" required>${state.projects.map((project) => `<option value="${project.id}" ${selectedProject?.id === project.id ? "selected" : ""}>${project.name}</option>`).join("")}</select></label>
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
          <select id="taskProjectFilter">
            <option value="" ${selectedProject ? "" : "selected"}>All projects</option>
            ${state.projects.map((project) => `<option value="${project.id}" ${selectedProject?.id === project.id ? "selected" : ""}>${project.name}</option>`).join("")}
          </select>
        </div>
        <div class="item-list" id="taskList">
          ${visibleTasks.map((task) => taskItem(task, true)).join("") || `<div class="empty">No tasks match this project.</div>`}
        </div>
      </div>
    </div>
  `;
}

function taskItem(task, editable) {
  const canManage = state.user.role === "admin";
  return `
    <article class="item">
      <div class="item-title">
        <h4>${task.title}</h4>
        <div class="actions tight-actions">
          <span class="chip ${task.status}">${statusLabel(task.status)}</span>
          ${canManage ? `
            <button class="icon-btn" title="Edit task" type="button" data-edit-task="${task.id}">${icon(icons.edit, 16)}</button>
            <button class="icon-btn danger-icon" title="Delete task" type="button" data-delete-task="${task.id}">${icon(icons.trash, 16)}</button>
          ` : ""}
        </div>
      </div>
      <div class="meta">
        <span>${task.project_name || "Project"}</span>
        <span>${task.assignee_name || "Unassigned"}</span>
        <span class="${isOverdue(task) ? "chip overdue" : ""}">${fmtDate(task.due_date)}</span>
        <span class="chip ${task.priority}">${task.priority}</span>
      </div>
      ${task.description ? `<p>${task.description}</p>` : ""}
      ${canManage && state.editingTaskId === task.id ? renderTaskEditForm(task) : ""}
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

function renderTaskEditForm(task) {
  return `
    <form class="edit-form task-edit-form" data-task-edit-form="${task.id}">
      <label>Title<input name="title" required minlength="2" value="${task.title}" /></label>
      <label>Description<textarea name="description">${task.description || ""}</textarea></label>
      <label>Project<select name="projectId" required>${state.projects.map((project) => `<option value="${project.id}" ${project.id === task.project_id ? "selected" : ""}>${project.name}</option>`).join("")}</select></label>
      <div class="form-row">
        <label>Assignee<select name="assigneeId"><option value="">Unassigned</option>${state.users.map((user) => `<option value="${user.id}" ${user.id === task.assignee_id ? "selected" : ""}>${user.name}</option>`).join("")}</select></label>
        <label>Priority<select name="priority"><option value="medium" ${task.priority === "medium" ? "selected" : ""}>Medium</option><option value="high" ${task.priority === "high" ? "selected" : ""}>High</option><option value="low" ${task.priority === "low" ? "selected" : ""}>Low</option></select></label>
      </div>
      <label>Due date<input type="date" name="dueDate" value="${inputDate(task.due_date)}" /></label>
      <div class="actions">
        <button class="primary" type="submit">${icon(icons.save)} Save</button>
        <button class="ghost" type="button" data-cancel-task-edit>${icon(icons.close)} Cancel</button>
      </div>
    </form>
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
  if (state.user.role !== "admin") return renderMemberTeams();
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
              ${user.id === state.user.id ? `<span class="chip">Admin profile</span>` : `<span class="chip">Member</span>`}
            </div>
            <div class="meta"><span>${user.email}</span></div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function renderMemberTeams() {
  return `
    <div class="panel">
      <div class="section-head">
        <h3>Assigned Teams</h3>
        <span class="chip">${state.projects.length} projects</span>
      </div>
      <div class="item-list">
        ${state.projects.map((project) => {
          const tasks = state.tasks.filter((task) => task.project_id === project.id);
          const members = state.projectMembers[project.id] || [];
          return `
            <article class="item">
              <div class="item-title">
                <h4>${project.name}</h4>
                <span class="chip">${tasks.length} tasks</span>
              </div>
              <p>${project.description || "No description"}</p>
              <div class="assigned-members">
                <strong>Members</strong>
                <div class="mini-list">
                  ${members.length ? members.map((member) => `<span>${member.name}</span>`).join("") : `<span>No members assigned.</span>`}
                </div>
              </div>
              <div class="item-list nested-list">
                ${tasks.length ? tasks.map((task) => taskItem(task, true)).join("") : `<div class="empty">No tasks assigned in this project.</div>`}
              </div>
            </article>
          `;
        }).join("") || `<div class="empty">You are not assigned to any projects yet.</div>`}
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
        state.selectedProjectId = null;
        state.editingProjectId = null;
        await loadData();
        renderApp();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  document.querySelectorAll("[data-select-project]").forEach((button) => {
    const openProject = async () => {
      state.selectedProjectId = Number(button.dataset.selectProject);
      await loadProjectMembers(state.selectedProjectId);
      renderApp();
    };

    button.addEventListener("click", openProject);
    button.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      await openProject();
    });
  });

  document.querySelectorAll("[data-edit-project]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingProjectId = Number(button.dataset.editProject);
      renderApp();
    });
  });

  const projectEditForm = document.querySelector("#projectEditForm");
  if (projectEditForm) {
    projectEditForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api(`/api/projects/${state.editingProjectId}`, {
          method: "PATCH",
          body: JSON.stringify(Object.fromEntries(new FormData(projectEditForm).entries()))
        });
        state.editingProjectId = null;
        await loadData();
        await loadProjectMembers(state.selectedProjectId);
        renderApp();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  const cancelProjectEdit = document.querySelector("[data-cancel-project-edit]");
  if (cancelProjectEdit) {
    cancelProjectEdit.addEventListener("click", () => {
      state.editingProjectId = null;
      renderApp();
    });
  }

  document.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.dataset.deleteProject);
      const shouldDelete = await confirmDialog({
        title: "Delete project?",
        message: "This will delete the project and all of its tasks.",
        confirmText: "Delete project"
      });
      if (!shouldDelete) return;
      try {
        await api(`/api/projects/${id}`, { method: "DELETE" });
        delete state.projectMembers[id];
        state.selectedProjectId = null;
        state.editingProjectId = null;
        await loadData();
        renderApp();
      } catch (error) {
        toast(error.message);
      }
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
      state.selectedProjectId = taskProjectFilter.value ? Number(taskProjectFilter.value) : null;
      renderApp();
    });
  }

  bindStatusButtons();
  bindTaskManageButtons();

}

function bindTaskManageButtons() {
  document.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingTaskId = Number(button.dataset.editTask);
      renderApp();
    });
  });

  document.querySelectorAll("[data-cancel-task-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingTaskId = null;
      renderApp();
    });
  });

  document.querySelectorAll("[data-task-edit-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = Number(form.dataset.taskEditForm);
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.assigneeId = payload.assigneeId ? Number(payload.assigneeId) : null;
      payload.projectId = Number(payload.projectId);
      payload.dueDate = payload.dueDate || null;
      try {
        await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
        state.editingTaskId = null;
        await loadData();
        if (state.selectedProjectId) await loadProjectMembers(state.selectedProjectId);
        renderApp();
      } catch (error) {
        toast(error.message);
      }
    });
  });

  document.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.dataset.deleteTask);
      const shouldDelete = await confirmDialog({
        title: "Delete task?",
        message: "This task will be removed from the project.",
        confirmText: "Delete task"
      });
      if (!shouldDelete) return;
      try {
        await api(`/api/tasks/${id}`, { method: "DELETE" });
        if (state.editingTaskId === id) state.editingTaskId = null;
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
  state.projectMembers[projectId] = data.members;
}

async function loadVisibleProjectMembers() {
  await Promise.all(
    state.projects
      .filter((project) => !state.projectMembers[project.id])
      .map((project) => loadProjectMembers(project.id))
  );
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
    if (state.view === "team" && state.user.role !== "admin") await loadVisibleProjectMembers();
    renderApp();
  } catch (error) {
    clearSession();
    renderAuth();
  }
})();
