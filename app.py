
from flask import Flask, render_template, request, jsonify
import sqlite3
from pathlib import Path

app = Flask(__name__)

DB_PATH = Path(__file__).with_name("student.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                category TEXT DEFAULT 'Study',
                priority TEXT DEFAULT 'Medium',
                due_date TEXT DEFAULT '',
                completed INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)


@app.route("/")
def home():
    return render_template("index.html")


@app.get("/api/tasks")
def get_tasks():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM tasks ORDER BY completed ASC, id DESC"
        ).fetchall()

    return jsonify([dict(row) for row in rows])


@app.post("/api/tasks")
def add_task():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "")).strip()

    if not title:
        return jsonify({"error": "Task title is required"}), 400

    if len(title) > 150:
        return jsonify({"error": "Title must be 150 characters or less"}), 400

    priority = data.get("priority", "Medium")
    if priority not in ("Low", "Medium", "High"):
        return jsonify({"error": "Invalid priority"}), 400

    category = str(data.get("category", "Study")).strip()[:50] or "Study"
    description = str(data.get("description", "")).strip()[:1000]
    due_date = str(data.get("due_date", ""))[:10]

    with get_db() as conn:
        cursor = conn.execute("""
            INSERT INTO tasks
                (title, description, category, priority, due_date)
            VALUES (?, ?, ?, ?, ?)
        """, (title, description, category, priority, due_date))

        row = conn.execute(
            "SELECT * FROM tasks WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()

    return jsonify(dict(row)), 201


@app.patch("/api/tasks/<int:task_id>")
def update_task(task_id):
    data = request.get_json(silent=True) or {}

    allowed = {
        "title", "description", "category",
        "priority", "due_date", "completed"
    }

    if not data or not set(data).issubset(allowed):
        return jsonify({"error": "Invalid task fields"}), 400

    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()

        if row is None:
            return jsonify({"error": "Task not found"}), 404

        values = dict(row)

        for key, value in data.items():
            if key == "completed":
                if not isinstance(value, bool):
                    return jsonify({"error": "completed must be true or false"}), 400
                values[key] = int(value)

            elif key == "priority":
                if value not in ("Low", "Medium", "High"):
                    return jsonify({"error": "Invalid priority"}), 400
                values[key] = value

            elif key == "title":
                value = str(value).strip()
                if not value or len(value) > 150:
                    return jsonify({"error": "Invalid title"}), 400
                values[key] = value

            elif key in ("description", "category", "due_date"):
                values[key] = str(value).strip()

        conn.execute("""
            UPDATE tasks
            SET title = ?, description = ?, category = ?,
                priority = ?, due_date = ?, completed = ?
            WHERE id = ?
        """, (
            values["title"], values["description"],
            values["category"], values["priority"],
            values["due_date"], values["completed"], task_id
        ))

        updated = conn.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()

    return jsonify(dict(updated))


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    with get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM tasks WHERE id = ?", (task_id,)
        )

        if cursor.rowcount == 0:
            return jsonify({"error": "Task not found"}), 404

    return jsonify({"message": "Task deleted"})


@app.get("/api/stats")
def get_stats():
    with get_db() as conn:
        stats = conn.execute("""
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(completed), 0) AS completed,
                COALESCE(SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END), 0)
                    AS pending,
                COALESCE(SUM(
                    CASE WHEN completed = 0
                         AND due_date <> ''
                         AND due_date < date('now', 'localtime')
                    THEN 1 ELSE 0 END
                ), 0) AS overdue
            FROM tasks
        """).fetchone()

    return jsonify(dict(stats))


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
