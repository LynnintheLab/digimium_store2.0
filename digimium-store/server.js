require('dotenv').config();

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const db = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Shared secret the separate admin app authenticates with. Without it the
// internal API stays closed — never fall back to "no key means open".
const API_KEY = process.env.STORE_API_KEY || '';

const DEFAULT_SETTINGS = {
  storeName: 'digimium',
  tagline: 'Digital products, delivered instantly.',
  description: '',
  currency: 'MMK',
  telegramUsername: 'LynnIsHere',
  telegramUrl: 'https://t.me/LynnIsHeree',
  telegramChannel: '',
  facebookPage: '',
  facebookLabel: '',
  facebookPage2: '',
  facebookLabel2: '',
  email: '',
  phone: '',
  announcement: '',
  checkoutNote: '',
  promoActive: '',
  promoTag: '',
  promoTitle: '',
  promoText: '',
  promoLink: '',
  promoLinkLabel: ''
};

app.use(express.json({ limit: '1mb' }));

/* -------------------------------------------------------------- internal auth */

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireApiKey(req, res, next) {
  if (!API_KEY) {
    return res.status(503).json({ error: 'Internal API is disabled: STORE_API_KEY is not set' });
  }
  const presented = req.get('x-api-key') || '';
  if (!presented || !safeEqual(presented, API_KEY)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

/* ------------------------------------------------------------------- uploads */

const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|gif|webp|avif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  }
});

/* ------------------------------------------------------------------- helpers */

function settings() {
  return { ...DEFAULT_SETTINGS, ...db.read('settings', DEFAULT_SETTINGS) };
}

function money(amount, currency) {
  return `${Number(amount).toLocaleString('en-US')} ${currency}`;
}

function sanitizeVariants(variants) {
  if (!Array.isArray(variants)) return [];
  return variants
    .map((v) => ({
      label: String(v.label || '').trim(),
      price: Math.max(0, Number(v.price) || 0)
    }))
    .filter((v) => v.label);
}

// A plan (Individual, Family…) holds its own set of durations and prices.
function sanitizePlans(plans) {
  if (!Array.isArray(plans)) return [];
  return plans
    .map((plan) => ({
      name: String(plan.name || '').trim(),
      brief: String(plan.brief || '').trim(),
      description: String(plan.description || '').trim(),
      options: sanitizeVariants(plan.options)
    }))
    .filter((plan) => plan.name && plan.options.length);
}

function normalizeProduct(body, existing = {}) {
  return {
    id: existing.id,
    name: String(body.name || '').trim(),
    category: String(body.category || '').trim(),
    brief: String(body.brief || '').trim(),
    description: String(body.description || '').trim(),
    price: Math.max(0, Number(body.price) || 0),
    image: String(body.image || '').trim(),
    badge: String(body.badge || '').trim(),
    active: body.active !== false && body.active !== 'false',
    promo: body.promo === true || body.promo === 'true',
    oldPrice:
      body.oldPrice === '' || body.oldPrice === null || body.oldPrice === undefined
        ? null
        : Math.max(0, Number(body.oldPrice) || 0),
    stock:
      body.stock === '' || body.stock === null || body.stock === undefined
        ? null
        : Math.max(0, Number(body.stock) || 0),
    variants: sanitizeVariants(body.variants),
    plans: sanitizePlans(body.plans),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// Prices always come from the stored product, never from the client payload.
// Products either have plans (each with its own durations) or a flat list of
// durations; falling back to the first entry keeps a stale cart from throwing.
function resolveOption(product, planName, variantLabel) {
  if (product.plans?.length) {
    const plan = product.plans.find((p) => p.name === planName) || product.plans[0];
    const option = plan.options.find((o) => o.label === variantLabel) || plan.options[0];
    return { plan: plan.name, variant: option ? option.label : '', price: option ? option.price : product.price };
  }
  if (product.variants.length) {
    const option = product.variants.find((v) => v.label === variantLabel) || product.variants[0];
    return { plan: '', variant: option.label, price: option.price };
  }
  return { plan: '', variant: '', price: product.price };
}

function buildOrderMessage(order, store) {
  const lines = [];
  lines.push(`NEW ORDER — ${store.storeName}`);
  lines.push(`Order code: ${order.code}`);
  lines.push('');
  order.items.forEach((item, index) => {
    const detail = [item.plan, item.variant].filter(Boolean).join(' · ');
    const title = detail ? `${item.name} (${detail})` : item.name;
    lines.push(`${index + 1}. ${title}`);
    lines.push(
      `   ${item.quantity} x ${money(item.unitPrice, store.currency)} = ${money(
        item.lineTotal,
        store.currency
      )}`
    );
  });
  lines.push('');
  lines.push(`TOTAL: ${money(order.total, store.currency)}`);
  if (order.customer.name) lines.push(`Name: ${order.customer.name}`);
  if (order.customer.contact) lines.push(`Contact: ${order.customer.contact}`);
  if (order.customer.note) lines.push(`Note: ${order.customer.note}`);
  return lines.join('\n');
}

// t.me/<user> opens the app on a phone, but on a desktop browser with no
// Telegram app registered it bounces to telegram.org/dl. Telegram Web takes
// desktop visitors straight to the chat instead.
function telegramHandle(store) {
  const fromUrl = /t\.me\/([A-Za-z0-9_]{4,})/.exec(store.telegramUrl || '');
  return (fromUrl ? fromUrl[1] : String(store.telegramUsername || '').replace(/^@/, '')).trim();
}

async function notifyTelegramBot(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    return res.ok;
  } catch (err) {
    console.error('Telegram notify failed:', err.message);
    return false;
  }
}

/* -------------------------------------------------------------- public routes */

app.get('/api/settings', (req, res) => {
  res.json(settings());
});

app.get('/api/products', (req, res) => {
  res.json(db.read('products', []).filter((p) => p.active !== false));
});

app.post('/api/orders', async (req, res) => {
  const store = settings();
  const products = db.read('products', []);
  const incoming = Array.isArray(req.body.items) ? req.body.items : [];

  if (!incoming.length) return res.status(400).json({ error: 'Your cart is empty' });

  const items = [];
  for (const raw of incoming) {
    const product = products.find((p) => p.id === Number(raw.id));
    if (!product || product.active === false) {
      return res.status(400).json({ error: 'A product in your cart is no longer available' });
    }
    const quantity = Math.min(99, Math.max(1, Number(raw.quantity) || 1));
    const chosen = resolveOption(
      product,
      raw.plan ? String(raw.plan) : '',
      raw.variant ? String(raw.variant) : ''
    );
    items.push({
      id: product.id,
      name: product.name,
      plan: chosen.plan,
      variant: chosen.variant,
      quantity,
      unitPrice: chosen.price,
      lineTotal: chosen.price * quantity
    });
  }

  const order = {
    id: Date.now(),
    code: `DG-${Date.now().toString(36).toUpperCase().slice(-6)}`,
    createdAt: new Date().toISOString(),
    status: 'new',
    items,
    total: items.reduce((sum, item) => sum + item.lineTotal, 0),
    customer: {
      name: String(req.body.name || '').trim().slice(0, 80),
      contact: String(req.body.contact || '').trim().slice(0, 120),
      note: String(req.body.note || '').trim().slice(0, 500)
    }
  };

  const orders = db.read('orders', []);
  orders.unshift(order);
  db.write('orders', orders.slice(0, 500));

  const message = buildOrderMessage(order, store);
  const notified = await notifyTelegramBot(message);

  res.json({
    order: { code: order.code, total: order.total },
    message,
    telegramUrl: store.telegramUrl,
    telegramWebUrl: telegramHandle(store) ? `https://web.telegram.org/k/#@${telegramHandle(store)}` : '',
    // Unused by the storefront, which opens the seller's own chat. Kept because
    // it is the only Telegram link that can carry the order text: swap to it in
    // checkout() if you would rather the message arrive prefilled and let the
    // customer pick the chat.
    shareUrl: `https://t.me/share/url?url=&text=${encodeURIComponent(message)}`,
    notified
  });
});

/* ------------------------------------------------------------- internal API
   Consumed only by the separate admin app, authenticated with STORE_API_KEY.
   -------------------------------------------------------------------------- */

const internal = express.Router();
internal.use(requireApiKey);

internal.get('/ping', (req, res) => res.json({ ok: true, store: settings().storeName }));

internal.get('/products', (req, res) => {
  res.json(db.read('products', []));
});

internal.post('/products', (req, res) => {
  const products = db.read('products', []);
  const product = normalizeProduct(req.body);
  if (!product.name) return res.status(400).json({ error: 'Product name is required' });
  product.id = db.nextId(products);
  products.push(product);
  db.write('products', products);
  res.status(201).json(product);
});

internal.put('/products/:id', (req, res) => {
  const products = db.read('products', []);
  const index = products.findIndex((p) => p.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Product not found' });
  const updated = normalizeProduct(req.body, products[index]);
  if (!updated.name) return res.status(400).json({ error: 'Product name is required' });
  updated.id = products[index].id;
  products[index] = updated;
  db.write('products', products);
  res.json(updated);
});

internal.delete('/products/:id', (req, res) => {
  const products = db.read('products', []);
  const remaining = products.filter((p) => p.id !== Number(req.params.id));
  if (remaining.length === products.length) {
    return res.status(404).json({ error: 'Product not found' });
  }
  db.write('products', remaining);
  res.json({ ok: true });
});

internal.get('/settings', (req, res) => res.json(settings()));

internal.put('/settings', (req, res) => {
  const next = settings();
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (req.body[key] !== undefined) next[key] = String(req.body[key]).trim();
  }
  db.write('settings', next);
  res.json(next);
});

internal.get('/orders', (req, res) => res.json(db.read('orders', [])));

internal.put('/orders/:id', (req, res) => {
  const orders = db.read('orders', []);
  const order = orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const allowed = ['new', 'paid', 'delivered', 'cancelled'];
  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  order.status = req.body.status;
  db.write('orders', orders);
  res.json(order);
});

internal.delete('/orders/:id', (req, res) => {
  const orders = db.read('orders', []);
  db.write('orders', orders.filter((o) => o.id !== Number(req.params.id)));
  res.json({ ok: true });
});

// Images are stored here so the storefront can serve them from its own origin.
internal.post('/upload', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

app.use('/api/internal', internal);

/* ---------------------------------------------------------------------- pages */

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n  digimium store  ->  http://localhost:${PORT}`);
  console.log(
    API_KEY
      ? '  internal API    ->  enabled (admin app can connect)\n'
      : '  internal API    ->  DISABLED: set STORE_API_KEY in .env to let the admin app connect\n'
  );
});
