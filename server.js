const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// Multer config for thumbnail uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Database setup
const db = new Database(path.join(__dirname, 'rbvc.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('developer', 'vc')),
    display_name TEXT,
    bio TEXT DEFAULT '',
    roblox_username TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pitches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    developer_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    tagline TEXT NOT NULL,
    description TEXT NOT NULL,
    genre TEXT NOT NULL,
    target_audience TEXT DEFAULT '',
    funding_goal REAL NOT NULL,
    funding_raised REAL DEFAULT 0,
    thumbnail TEXT DEFAULT '',
    roblox_link TEXT DEFAULT '',
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'funded', 'closed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (developer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pitch_id INTEGER NOT NULL,
    vc_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    message TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pitch_id) REFERENCES pitches(id),
    FOREIGN KEY (vc_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pitch_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pitch_id) REFERENCES pitches(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'rbvc-local-dev-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (req.session.role !== role) {
      return res.status(403).json({ error: `Requires ${role} role` });
    }
    next();
  };
}

// ─── AUTH ROUTES ───

app.post('/api/register', (req, res) => {
  const { username, email, password, role, display_name, roblox_username } = req.body;
  if (!username || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!['developer', 'vc'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    return res.status(409).json({ error: 'Username or email already exists' });
  }
  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, email, password, role, display_name, roblox_username) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(username, email, hashed, role, display_name || username, roblox_username || '');

  req.session.userId = result.lastInsertRowid;
  req.session.role = role;
  res.json({ id: result.lastInsertRowid, username, role });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ id: user.id, username: user.username, role: user.role, display_name: user.display_name });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) {
    return res.json(null);
  }
  const user = db.prepare('SELECT id, username, email, role, display_name, bio, roblox_username, created_at FROM users WHERE id = ?').get(req.session.userId);
  res.json(user);
});

// ─── PITCH ROUTES ───

app.get('/api/pitches', (req, res) => {
  const { genre, status, search, sort } = req.query;
  let query = `
    SELECT p.*, u.username as developer_username, u.display_name as developer_name,
           u.roblox_username as developer_roblox
    FROM pitches p
    JOIN users u ON p.developer_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (genre && genre !== 'all') {
    query += ' AND p.genre = ?';
    params.push(genre);
  }
  if (status && status !== 'all') {
    query += ' AND p.status = ?';
    params.push(status);
  } else {
    query += ' AND p.status = "active"';
  }
  if (search) {
    query += ' AND (p.title LIKE ? OR p.tagline LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (sort === 'funded') {
    query += ' ORDER BY p.funding_raised DESC';
  } else if (sort === 'goal') {
    query += ' ORDER BY p.funding_goal ASC';
  } else {
    query += ' ORDER BY p.created_at DESC';
  }

  const pitches = db.prepare(query).all(...params);
  res.json(pitches);
});

app.get('/api/pitches/:id', (req, res) => {
  const pitch = db.prepare(`
    SELECT p.*, u.username as developer_username, u.display_name as developer_name,
           u.roblox_username as developer_roblox, u.bio as developer_bio
    FROM pitches p
    JOIN users u ON p.developer_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!pitch) return res.status(404).json({ error: 'Pitch not found' });

  const investments = db.prepare(`
    SELECT i.*, u.display_name as vc_name, u.username as vc_username
    FROM investments i
    JOIN users u ON i.vc_id = u.id
    WHERE i.pitch_id = ?
    ORDER BY i.created_at DESC
  `).all(req.params.id);

  const comments = db.prepare(`
    SELECT c.*, u.display_name as author_name, u.username as author_username, u.role as author_role
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.pitch_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);

  res.json({ ...pitch, investments, comments });
});

app.post('/api/pitches', requireRole('developer'), upload.single('thumbnail'), (req, res) => {
  const { title, tagline, description, genre, target_audience, funding_goal, roblox_link } = req.body;
  if (!title || !tagline || !description || !genre || !funding_goal) {
    return res.status(400).json({ error: 'Required fields missing' });
  }
  const goalNum = parseFloat(funding_goal);
  if (isNaN(goalNum) || goalNum <= 0) {
    return res.status(400).json({ error: 'Invalid funding goal' });
  }
  const thumbnail = req.file ? `/uploads/${req.file.filename}` : '';
  const result = db.prepare(`
    INSERT INTO pitches (developer_id, title, tagline, description, genre, target_audience, funding_goal, thumbnail, roblox_link)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.session.userId, title, tagline, description, genre, target_audience || '', goalNum, thumbnail, roblox_link || '');

  res.json({ id: result.lastInsertRowid });
});

app.put('/api/pitches/:id', requireRole('developer'), (req, res) => {
  const pitch = db.prepare('SELECT * FROM pitches WHERE id = ? AND developer_id = ?').get(req.params.id, req.session.userId);
  if (!pitch) return res.status(404).json({ error: 'Pitch not found or not yours' });

  const { title, tagline, description, genre, target_audience, funding_goal, roblox_link, status } = req.body;
  db.prepare(`
    UPDATE pitches SET title = ?, tagline = ?, description = ?, genre = ?, target_audience = ?,
    funding_goal = ?, roblox_link = ?, status = ? WHERE id = ?
  `).run(
    title || pitch.title, tagline || pitch.tagline, description || pitch.description,
    genre || pitch.genre, target_audience || pitch.target_audience,
    funding_goal || pitch.funding_goal, roblox_link || pitch.roblox_link,
    status || pitch.status, req.params.id
  );
  res.json({ ok: true });
});

// ─── INVESTMENT ROUTES ───

app.post('/api/pitches/:id/invest', requireRole('vc'), (req, res) => {
  const { amount, message } = req.body;
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  const pitch = db.prepare('SELECT * FROM pitches WHERE id = ? AND status = "active"').get(req.params.id);
  if (!pitch) return res.status(404).json({ error: 'Pitch not found or not active' });

  db.prepare('INSERT INTO investments (pitch_id, vc_id, amount, message) VALUES (?, ?, ?, ?)').run(
    req.params.id, req.session.userId, amountNum, message || ''
  );

  const newRaised = pitch.funding_raised + amountNum;
  const newStatus = newRaised >= pitch.funding_goal ? 'funded' : 'active';
  db.prepare('UPDATE pitches SET funding_raised = ?, status = ? WHERE id = ?').run(newRaised, newStatus, req.params.id);

  res.json({ ok: true, funding_raised: newRaised, status: newStatus });
});

// ─── COMMENT ROUTES ───

app.post('/api/pitches/:id/comments', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment cannot be empty' });
  }
  const pitch = db.prepare('SELECT id FROM pitches WHERE id = ?').get(req.params.id);
  if (!pitch) return res.status(404).json({ error: 'Pitch not found' });

  const result = db.prepare('INSERT INTO comments (pitch_id, user_id, content) VALUES (?, ?, ?)').run(
    req.params.id, req.session.userId, content.trim()
  );

  const comment = db.prepare(`
    SELECT c.*, u.display_name as author_name, u.username as author_username, u.role as author_role
    FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?
  `).get(result.lastInsertRowid);

  res.json(comment);
});

// ─── DASHBOARD ROUTES ───

app.get('/api/dashboard/developer', requireRole('developer'), (req, res) => {
  const pitches = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM investments WHERE pitch_id = p.id) as investor_count
    FROM pitches p WHERE p.developer_id = ? ORDER BY p.created_at DESC
  `).all(req.session.userId);

  const totalRaised = pitches.reduce((sum, p) => sum + p.funding_raised, 0);
  res.json({ pitches, totalRaised });
});

app.get('/api/dashboard/vc', requireRole('vc'), (req, res) => {
  const investments = db.prepare(`
    SELECT i.*, p.title as pitch_title, p.status as pitch_status,
           u.display_name as developer_name
    FROM investments i
    JOIN pitches p ON i.pitch_id = p.id
    JOIN users u ON p.developer_id = u.id
    WHERE i.vc_id = ?
    ORDER BY i.created_at DESC
  `).all(req.session.userId);

  const totalInvested = investments.reduce((sum, i) => sum + i.amount, 0);
  res.json({ investments, totalInvested });
});

// ─── STATS ───

app.get('/api/stats', (req, res) => {
  const totalPitches = db.prepare('SELECT COUNT(*) as count FROM pitches').get().count;
  const totalFunded = db.prepare('SELECT COUNT(*) as count FROM pitches WHERE status = "funded"').get().count;
  const totalRaised = db.prepare('SELECT COALESCE(SUM(funding_raised), 0) as total FROM pitches').get().total;
  const totalInvestors = db.prepare('SELECT COUNT(DISTINCT vc_id) as count FROM investments').get().count;
  res.json({ totalPitches, totalFunded, totalRaised, totalInvestors });
});

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RBVC Platform running at http://localhost:${PORT}`);
});
