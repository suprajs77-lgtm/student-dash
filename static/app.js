
const taskList = document.getElementById("taskList");
const modal = document.getElementById("modal");
const taskForm = document.getElementById("taskForm");
const toast = document.getElementById("toast");

let tasks = [];
let currentFilter = "all";
let editingId = null;

async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
    }

    return data;
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function notify(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle("error", isError);

    setTimeout(() => {
        toast.textContent = "";
        toast.classList.remove("error");
    }, 3000);
}

function isOverdue(task) {
    const today = new Date();
    const localToday = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0")
    ].join("-");

    return !task.completed && task.due_date && task.due_date < localToday;
}

async function loadTasks() {
    try {
        [tasks] = await Promise.all([
            api("/api/tasks").then(data => data),
            refreshStats()
        ]);

        renderTasks();
    } catch (error) {
        taskList.innerHTML =
            '<div class="empty-state">Could not load tasks. Check that Flask is running and refresh.</div>';
        notify(error.message, true);
    }
}

async function refreshStats() {
    const stats = await api("/api/stats");

    document.getElementById("totalStat").textContent = stats.total;
    document.getElementById("completedStat").textContent = stats.completed;
    document.getElementById("pendingStat").textContent = stats.pending;
    document.getElementById("overdueStat").textContent = stats.overdue;

    const percentage = stats.total
        ? Math.round(stats.completed / stats.total * 100)
        : 0;

    document.getElementById("progressPercent").textContent = `${percentage}%`;
    document.getElementById("progressBar").style.width = `${percentage}%`;
    document.getElementById("progressLabel").textContent =
        `${stats.completed} of ${stats.total} tasks completed`;
}

function renderTasks() {
    const search = document.getElementById("searchInput").value
        .trim().toLowerCase();

    const priority = document.getElementById("priorityFilter").value;

    const filtered = tasks.filter(task => {
        const matchesSearch =
            task.title.toLowerCase().includes(search) ||
            (task.description || "").toLowerCase().includes(search) ||
            (task.category || "").toLowerCase().includes(search);

        const matchesPriority =
            priority === "all" || task.priority === priority;

        const matchesFilter =
            currentFilter === "all" ||
            (currentFilter === "pending" && !task.completed) ||
            (currentFilter === "completed" && task.completed) ||
            (currentFilter === "overdue" && isOverdue(task));

        return matchesSearch && matchesPriority && matchesFilter;
    });

    document.getElementById("taskCount").textContent = filtered.length;

    if (!filtered.length) {
        taskList.innerHTML = `
            <div class="empty-state">
                <strong>No tasks found</strong>
                Try another filter or create a new task.
            </div>`;
        return;
    }

    taskList.innerHTML = filtered.map(task => {
        const priorityClass = `priority-${task.priority.toLowerCase()}`;
        const overdue = isOverdue(task);

        return `
            <article class="task-row">
                <input
                    class="task-check"
                    type="checkbox"
                    aria-label="Mark ${escapeHTML(task.title)} complete"
                    data-action="complete"
                    data-id="${task.id}"
                    ${task.completed ? "checked" : ""}
                >

                <div class="task-info">
                    <div class="task-title ${task.completed ? "done" : ""}">
                        ${escapeHTML(task.title)}
                    </div>

                    ${task.description ? `
                        <div class="task-description">
                            ${escapeHTML(task.description)}
                        </div>` : ""}

                    <div class="task-meta">
                        <span class="pill">${escapeHTML(task.category)}</span>
                        <span class="pill ${priorityClass}">
                            ${escapeHTML(task.priority)}
                        </span>

                        ${task.due_date ? `
                            <span class="due-date ${overdue ? "late" : ""}">
                                ${overdue ? "Overdue · " : "Due · "}
                                ${escapeHTML(task.due_date)}
                            </span>` : ""}
                    </div>
                </div>

                <div class="task-actions">
                    <button class="icon-btn" data-action="edit"
                        data-id="${task.id}" aria-label="Edit task">✎</button>
                    <button class="icon-btn" data-action="delete"
                        data-id="${task.id}" aria-label="Delete task">×</button>
                </div>
            </article>`;
    }).join("");
}

function openForm(task = null) {
    editingId = task ? task.id : null;
    taskForm.reset();

    document.getElementById("formTitle").textContent =
        task ? "Edit task" : "Create a task";

    document.getElementById("saveButton").textContent =
        task ? "Save changes" : "Create task";

    if (task) {
        for (const field of [
            "title", "description", "category", "priority", "due_date"
        ]) {
            taskForm.elements[field].value = task[field] || (
                field === "category" ? "Study" :
                field === "priority" ? "Medium" : ""
            );
        }
    }

    modal.classList.add("open");
    document.getElementById("title").focus();
}

function closeForm() {
    modal.classList.remove("open");
    editingId = null;
    taskForm.reset();
}

document.getElementById("openForm").addEventListener("click", () => openForm());
document.getElementById("closeForm").addEventListener("click", closeForm);
document.getElementById("cancelForm").addEventListener("click", closeForm);

modal.addEventListener("click", event => {
    if (event.target === modal) closeForm();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeForm();
});

taskForm.addEventListener("submit", async event => {
    event.preventDefault();

    const payload = Object.fromEntries(new FormData(taskForm).entries());

    try {
        const isEditing = editingId !== null;
        const url = isEditing
            ? `/api/tasks/${editingId}`
            : "/api/tasks";

        await api(url, {
            method: isEditing ? "PATCH" : "POST",
            body: JSON.stringify(payload)
        });

        closeForm();
        await loadTasks();
        notify(isEditing ? "Task updated successfully" : "Task created successfully");
    } catch (error) {
        notify(error.message, true);
    }
});

taskList.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const id = Number(button.dataset.id);
    const action = button.dataset.action;
    const task = tasks.find(item => item.id === id);

    if (!task) return;

    try {
        if (action === "edit") {
            openForm(task);
            return;
        }

        if (action === "delete") {
            if (!confirm(`Delete "${task.title}"?`)) return;

            await api(`/api/tasks/${id}`, { method: "DELETE" });
            await loadTasks();
            notify("Task deleted");
        }
    } catch (error) {
        notify(error.message, true);
    }
});

taskList.addEventListener("change", async event => {
    const checkbox = event.target.closest('[data-action="complete"]');
    if (!checkbox) return;

    try {
        await api(`/api/tasks/${checkbox.dataset.id}`, {
            method: "PATCH",
            body: JSON.stringify({ completed: checkbox.checked })
        });

        await loadTasks();
        notify(checkbox.checked ? "Task completed!" : "Task reopened");
    } catch (error) {
        notify(error.message, true);
        await loadTasks();
    }
});

function setFilter(filter) {
    currentFilter = filter;

    document.querySelectorAll("[data-filter]").forEach(button => {
        button.classList.toggle(
            "selected",
            button.classList.contains("filter-btn") &&
            button.dataset.filter === filter
        );

        button.classList.toggle(
            "active",
            button.classList.contains("nav-item") &&
            button.dataset.filter === filter
        );
    });

    renderTasks();
}

document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => setFilter(button.dataset.filter));
});

document.getElementById("searchInput").addEventListener("input", renderTasks);
document.getElementById("priorityFilter").addEventListener("change", renderTasks);

loadTasks();
