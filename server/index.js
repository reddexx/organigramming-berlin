const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 80;
const DATA_DIR = process.env.DATA_DIR || '/data';
const SHARED_FILE = path.join(DATA_DIR, 'shared-charts.json');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Serve env.json from build folder if present (written by entrypoint), otherwise expose basic env
app.get('/env.json', async (req, res) => {
  try {
    const envPath = path.join(__dirname, '..', 'app', 'build', 'env.json');
    const data = await fs.readFile(envPath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch (e) {
    res.json({ mode: process.env.MODE || 'viewer', adminPassword: process.env.ADMIN_PASSWORD || '' });
  }
});

app.get('/api/charts', async (req, res) => {
  try {
    const raw = await fs.readFile(SHARED_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    // if file missing or invalid, return empty array
    res.json([]);
  }
});

app.post('/api/charts', async (req, res) => {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const list = (
      (await (async () => {
        try {
          const raw = await fs.readFile(SHARED_FILE, 'utf8');
          return JSON.parse(raw);
        } catch (e) {
          return [];
        }
      })())
    );
    const payload = req.body;
    // simple id if not present
    if (!payload.id) payload.id = Date.now().toString();
    payload.timestamp = new Date().toISOString();
    list.unshift(payload);
    await fs.writeFile(SHARED_FILE, JSON.stringify(list, null, 2), 'utf8');
    res.status(201).json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to save' });
  }
});

// Serve static SPA
const buildPath = path.join(__dirname, '..', 'app', 'build');
app.use(express.static(buildPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
