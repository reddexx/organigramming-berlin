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

// Serve data directory (images, saved charts) under /data
app.use('/data', express.static(DATA_DIR));

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
    let list = (
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
    const shouldOverwrite = Boolean(payload.overwrite && payload.id);
    const existingIndex = shouldOverwrite
      ? list.findIndex((chart) => chart.id === payload.id)
      : -1;

    // simple id if not present
    if (!payload.id) payload.id = Date.now().toString();
    payload.timestamp = new Date().toISOString();
    delete payload.overwrite;

    // if payload requests to be main chart, unset others
    if (payload.isMainChart) {
      list = list.map((c) => ({ ...c, isMainChart: false }));
    }

    if (existingIndex >= 0) {
      list[existingIndex] = {
        ...list[existingIndex],
        ...payload,
      };
    } else {
      list.unshift(payload);
    }

    await fs.writeFile(SHARED_FILE, JSON.stringify(list, null, 2), 'utf8');
    res.status(existingIndex >= 0 ? 200 : 201).json(payload);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to save' });
  }
});

app.delete('/api/charts/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const raw = await fs.readFile(SHARED_FILE, 'utf8');
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return res.status(400).json({ error: 'invalid list' });
    if (list.length <= 1) {
      return res.status(400).json({ error: 'Konnte nicht gelöscht werden, da es das letzte Organigramm ist' });
    }
    const filtered = list.filter((c) => c.id !== id);
    await fs.writeFile(SHARED_FILE, JSON.stringify(filtered, null, 2), 'utf8');
    res.status(200).json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to delete' });
  }
});

// Upload image (base64 data URL) to DATA_DIR/image and return public path
app.post('/api/upload-image', async (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!data) return res.status(400).json({ error: 'missing data' });
    const dir = path.join(DATA_DIR, 'image');
    await fs.mkdir(dir, { recursive: true });

    // data is expected as data:<mime>;name=<name>;base64,<base64string>
    const matches = data.match(/^data:(.+);base64,(.*)$/);
    let buffer;
    if (matches) {
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      // fallback: raw base64
      buffer = Buffer.from(data, 'base64');
    }

    const safeName = filename || Date.now().toString();
    const outPath = path.join(dir, safeName);
    await fs.writeFile(outPath, buffer);

    // return URL path where the image is served
    res.status(201).json({ url: `/data/image/${safeName}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to upload' });
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
