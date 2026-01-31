'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Home() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
  });

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${API_URL}/api/tasks`);
      const data = await res.json();
      setTasks(data);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingTask) {
        const res = await fetch(`${API_URL}/api/tasks/${editingTask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const updated = await res.json();
        setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        const res = await fetch(`${API_URL}/api/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const newTask = await res.json();
        setTasks([...tasks, newTask]);
      }

      closeModal();
    } catch (error) {
      console.error('Failed to save task:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${API_URL}/api/tasks/${id}`, { method: 'DELETE' });
      setTasks(tasks.filter((t) => t.id !== id));
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const handleStatusChange = async (task, newStatus) => {
    try {
      const res = await fetch(`${API_URL}/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, status: newStatus }),
      });
      const updated = await res.json();
      setTasks(tasks.map((t) => (t.id === updated.id ? updated : t)));
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const openModal = (task = null) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
      });
    } else {
      setEditingTask(null);
      setFormData({
        title: '',
        description: '',
        status: 'todo',
        priority: 'medium',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTask(null);
    setFormData({
      title: '',
      description: '',
      status: 'todo',
      priority: 'medium',
    });
  };

  const getTasksByStatus = (status) => tasks.filter((t) => t.status === status);

  const stats = {
    total: tasks.length,
    inProgress: getTasksByStatus('in-progress').length,
    completed: getTasksByStatus('done').length,
  };

  return (
    <div className="page">
      <header className="header">
        <h1 className="logo">
          FLUX<span className="logo-accent">.</span>
        </h1>
        <div className="header-meta">
          <div className="status-indicator">
            <span className="status-dot"></span>
            <span>System Online</span>
          </div>
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </header>

      <main className="main">
        <aside className="sidebar">
          <div>
            <h2 className="sidebar-title">Overview</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value orange">{stats.total}</div>
                <div className="stat-label">Total Tasks</div>
              </div>
              <div className="stat-card">
                <div className="stat-value cyan">{stats.inProgress}</div>
                <div className="stat-label">In Progress</div>
              </div>
              <div className="stat-card">
                <div className="stat-value lime">{stats.completed}</div>
                <div className="stat-label">Completed</div>
              </div>
            </div>
          </div>

          <button className="create-btn" onClick={() => openModal()}>
            + New Task
          </button>
        </aside>

        <section className="content">
          <div className="content-header">
            <h2 className="content-title">Tasks</h2>
            <p className="content-subtitle">
              Organize, prioritize, and execute. Move tasks between columns to track progress.
            </p>
          </div>

          {loading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
            </div>
          ) : (
            <div className="task-columns">
              <TaskColumn
                title="To Do"
                tasks={getTasksByStatus('todo')}
                onEdit={openModal}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
                nextStatus="in-progress"
              />
              <TaskColumn
                title="In Progress"
                tasks={getTasksByStatus('in-progress')}
                onEdit={openModal}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
                nextStatus="done"
                prevStatus="todo"
              />
              <TaskColumn
                title="Done"
                tasks={getTasksByStatus('done')}
                onEdit={openModal}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
                prevStatus="in-progress"
              />
            </div>
          )}
        </section>
      </main>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{editingTask ? 'Edit Task' : 'Create Task'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="What needs to be done?"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Add more details..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="todo">To Do</option>
                    <option value="in-progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select
                    className="form-select"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingTask ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskColumn({ title, tasks, onEdit, onDelete, onStatusChange, nextStatus, prevStatus }) {
  return (
    <div className="task-column">
      <div className="column-header">
        <span className="column-title">{title}</span>
        <span className="column-count">{tasks.length}</span>
      </div>
      <div className="task-list">
        {tasks.length === 0 ? (
          <div className="empty-state">No tasks yet</div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={() => onEdit(task)}
              onDelete={() => onDelete(task.id)}
              onMoveNext={nextStatus ? () => onStatusChange(task, nextStatus) : null}
              onMovePrev={prevStatus ? () => onStatusChange(task, prevStatus) : null}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete, onMoveNext, onMovePrev }) {
  return (
    <div className={`task-card ${task.priority}`}>
      <h4 className="task-title">{task.title}</h4>
      {task.description && <p className="task-description">{task.description}</p>}
      <div className="task-meta">
        <span className={`task-priority ${task.priority}`}>{task.priority}</span>
        <div className="task-actions">
          {onMovePrev && (
            <button className="task-action-btn" onClick={onMovePrev} title="Move back">
              ←
            </button>
          )}
          {onMoveNext && (
            <button className="task-action-btn" onClick={onMoveNext} title="Move forward">
              →
            </button>
          )}
          <button className="task-action-btn" onClick={onEdit} title="Edit">
            ✎
          </button>
          <button className="task-action-btn delete" onClick={onDelete} title="Delete">
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
