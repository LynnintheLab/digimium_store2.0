require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

const db = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 4000;

const STORE_URL = (process.env.STORE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const STORE_API_KEY = process.env.STORE_API_KEY || '';

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours
const MIN_PASSCODE_LENGTH = 6;

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.set('trust proxy', 1);

/* --------------------------------------------------------------- credentials */

function getCredentials() {
  const stored = db.read('admin', null);
  if (stored) return stored;

  const seed = process.env.ADMIN_PASSCODE || '';
  const fresh = {
    passcodeHash: bcrypt.hashSync(seed || '123456', 10),
    isDefault: !seed,
    updatedAt: new Date().toISOString()
  };
  db.write('admin', fresh);
  return fresh;
}

function setPasscode(passcode) {
  return db.write('admin', {
    passcodeHash: bcrypt.hashSync(passcode, 10),
    isDefault: false,
    updatedAt: new Date().toISOString()
  });
}

/* ------------------------------------------------------------------ sessions */

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

function makeToken() {
  const payload = `admin.${Date.now() + SESSION_TTL_MS}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return false;
  let payload;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(payload.split('.')[1]) > Date.now();
}

function requireSession(req, res, next) {
  if (!verifyToken(req.cookies.dg_session)) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  next();
}

// A short passcode is only safe behind a hard throttle, so lock the door early.
const attempts = new Map();
const MAX_ATTEMPTS = 6;
const LOCKOUT_MS = 15 * 60 * 1000;

function lockedOut(ip) {
  const entry = attempts.get(ip);
  if (!entry) return 0;
  if (Date.now() - entry.first > LOCKOUT_MS) {
    attempts.delete(ip);
    return 0;
  }
  if (entry.count < MAX_ATTEMPTS) return 0;
  return Math.ceil((LOCKOUT_MS - (Date.now() - entry.first)) / 60000);
}

function recordFailure(ip) {
  const entry = attempts.get(ip) || { count: 0, first: Date.now() };
  entry.count += 1;
  attempts.set(ip, entry);
  return MAX_ATTEMPTS - entry.count;
}

/* --------------------------------------------------------------- store proxy */

async function callStore(method, endpoint, body) {
  if (!STORE_API_KEY) {
    const err = new Error('STORE_API_KEY is not set in this admin app');
    err.status = 500;
    throw err;
  }

  let res;
  try {
    res = await fetch(`${STORE_URL}/api/internal${endpoint}`, {
      method,
      headers: {
        'x-api-key': STORE_API_KEY,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (cause) {
    const err = new Error(`Cannot reach the store at ${STORE_URL}`);
    err.status = 502;
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Store returned ${res.status}`);
    err.status = res.status === 401 ? 502 : res.status;
    if (res.status === 401) err.message = 'Store rejected the API key';
    throw err;
  }
  return data;
}

// Forwards a proxied call and normalises failures into JSON for the browser.
function proxy(method, endpointFor) {
  return async (req, res) => {
    try {
      const endpoint = typeof endpointFor === 'function' ? endpointFor(req) : endpointFor;
      const body = method === 'GET' || method === 'DELETE' ? undefined : req.body;
      res.json(await callStore(method, endpoint, body));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  };
}

/* ------------------------------------------------------------------- uploads */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|gif|webp|avif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  }
});

/* -------------------------------------------------------------------- routes */

app.post('/api/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const minutes = lockedOut(ip);
  if (minutes) {
    return res.status(429).json({ error: `Too many attempts. Try again in ${minutes} minute(s).` });
  }

  const passcode = String(req.body.passcode || '');
  const creds = getCredentials();

  if (!passcode || !bcrypt.compareSync(passcode, creds.passcodeHash)) {
    const left = recordFailure(ip);
    return res.status(401).json({
      error: left > 0 ? `Wrong passcode. ${left} attempt(s) left.` : 'Too many attempts. Locked for 15 minutes.'
    });
  }

  attempts.delete(ip);
  res.cookie('dg_session', makeToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS
  });
  res.json({ ok: true, isDefault: !!creds.isDefault });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('dg_session');
  res.json({ ok: true });
});

app.get('/api/me', requireSession, async (req, res) => {
  const creds = getCredentials();
  let store = null;
  try {
    store = (await callStore('GET', '/ping')).store;
  } catch (err) {
    return res.json({ isDefault: !!creds.isDefault, storeUrl: STORE_URL, storeError: err.message });
  }
  res.json({ isDefault: !!creds.isDefault, storeUrl: STORE_URL, store });
});

app.post('/api/passcode', requireSession, (req, res) => {
  const creds = getCredentials();
  const current = String(req.body.currentPasscode || '');
  const next = String(req.body.newPasscode || '');

  if (!bcrypt.compareSync(current, creds.passcodeHash)) {
    return res.status(400).json({ error: 'Current passcode is wrong' });
  }
  if (next.length < MIN_PASSCODE_LENGTH) {
    return res.status(400).json({ error: `New passcode must be at least ${MIN_PASSCODE_LENGTH} characters` });
  }
  if (/^(\d)\1+$/.test(next) || next === '123456') {
    return res.status(400).json({ error: 'That passcode is too easy to guess' });
  }

  setPasscode(next);
  res.json({ ok: true });
});

app.get('/api/products', requireSession, proxy('GET', '/products'));
app.post('/api/products', requireSession, proxy('POST', '/products'));
app.put('/api/products/:id', requireSession, proxy('PUT', (req) => `/products/${req.params.id}`));
app.delete('/api/products/:id', requireSession, proxy('DELETE', (req) => `/products/${req.params.id}`));

app.get('/api/settings', requireSession, proxy('GET', '/settings'));
app.put('/api/settings', requireSession, proxy('PUT', '/settings'));

app.get('/api/orders', requireSession, proxy('GET', '/orders'));
app.put('/api/orders/:id', requireSession, proxy('PUT', (req) => `/orders/${req.params.id}`));
app.delete('/api/orders/:id', requireSession, proxy('DELETE', (req) => `/orders/${req.params.id}`));

// The file itself is relayed to the store, which owns /uploads.
app.post('/api/upload', requireSession, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    if (!STORE_API_KEY) return res.status(500).json({ error: 'STORE_API_KEY is not set in this admin app' });

    const form = new FormData();
    form.append('image', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);

    try {
      const relay = await fetch(`${STORE_URL}/api/internal/upload`, {
        method: 'POST',
        headers: { 'x-api-key': STORE_API_KEY },
        body: form
      });
      const data = await relay.json().catch(() => ({}));
      if (!relay.ok) return res.status(relay.status).json({ error: data.error || 'Upload failed' });
      // Store-relative path -> absolute, so the preview loads from the store origin.
      res.json({ url: `${STORE_URL}${data.url}`, path: data.url });
    } catch {
      res.status(502).json({ error: `Cannot reach the store at ${STORE_URL}` });
    }
  });
});

app.get('/api/store-url', requireSession, (req, res) => res.json({ storeUrl: STORE_URL }));

app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Started directly by `npm start`, but only exported when a host imports this
// file and mounts the app on a listener of its own. Binding a port in that case
// would leave the app answering on a port nothing is proxied to.
if (require.main === module) {
  app.listen(PORT, () => {
    const creds = getCredentials();
    console.log(`\n  digimium admin  ->  http://localhost:${PORT}`);
    console.log(`  store           ->  ${STORE_URL}`);
    if (!STORE_API_KEY) {
      console.log('  WARNING: STORE_API_KEY is not set — the panel cannot load any data.');
    }
    if (creds.isDefault) {
      console.log('  passcode        ->  123456  (default — change it on the Account tab)');
    }
    console.log('');
  });
}

module.exports = app;
