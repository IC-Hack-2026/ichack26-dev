const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-memory data store
let tasks = [
    {
        id: uuidv4(),
        title: 'Design system overhaul',
        description: 'Rebuild the component library with new tokens',
        status: 'in-progress',
        priority: 'high',
        createdAt: new Date().toISOString(),
    },
    {
        id: uuidv4(),
        title: 'API documentation',
        description: 'Write comprehensive docs for all endpoints',
        status: 'todo',
        priority: 'medium',
        createdAt: new Date().toISOString(),
    },
    {
        id: uuidv4(),
        title: 'Performance audit',
        description: 'Analyze and optimize critical render paths',
        status: 'done',
        priority: 'high',
        createdAt: new Date().toISOString(),
    },
];

// Get all tasks
app.get('/api/tasks', (req, res) => {
    res.json(tasks);
});

// Get single task
app.get('/api/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
});

// Create task
app.post('/api/tasks', (req, res) => {
    const { title, description, status = 'todo', priority = 'medium' } = req.body;

    if (!title) {
        return res.status(400).json({ error: 'Title is required' });
    }

    const task = {
        id: uuidv4(),
        title,
        description: description || '',
        status,
        priority,
        createdAt: new Date().toISOString(),
    };

    tasks.push(task);
    res.status(201).json(task);
});

// Update task
app.put('/api/tasks/:id', (req, res) => {
    const index = tasks.findIndex(t => t.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'Task not found' });
    }

    const { title, description, status, priority } = req.body;

    tasks[index] = {
        ...tasks[index],
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
        ...(priority && { priority }),
    };

    res.json(tasks[index]);
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
    const index = tasks.findIndex(t => t.id === req.params.id);

    if (index === -1) {
        return res.status(404).json({ error: 'Task not found' });
    }

    tasks.splice(index, 1);
    res.status(204).send();
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
});
