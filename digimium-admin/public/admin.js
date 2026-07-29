/* digimium — standalone admin panel */

const $ = (id) => document.getElementById(id);

const icon = (name, cls = 'icon-sm') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}" /></svg>`;

const state = {
  products: [],
  orders: [],
  settings: {},
  storeUrl: '',
  editingId: null
};

/* ------------------------------------------------------------------ utilities */

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  // A 401 from the login route is a wrong passcode, not an expired session.
  if (res.status === 401 && url !== '/api/login') {
    showLogin();
    throw new Error('Session expired — enter your passcode again');
  }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function money(amount) {
  return `${Number(amount).toLocaleString('en-US')} ${state.settings.currency || ''}`.trim();
}

// Product images are stored store-relative, so resolve them against the store origin.
function imageSrc(image) {
  if (!image) return '';
  return image.startsWith('/') ? `${state.storeUrl}${image}` : image;
}

function thumb(image) {
  return `<span class="thumb">${image
    ? `<img class="photo" src="${esc(imageSrc(image))}" alt="" />`
    : `<img class="mark" src="/assets/logo-mark.png" alt="" />`}</span>`;
}

/* ---------------------------------------------------------------------- theme */

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#070d1e' : '#051650');
  $('themeBtn').setAttribute(
    'aria-label',
    theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  );
  try { localStorage.setItem('digimium_theme', theme); } catch {}
}

$('themeBtn').addEventListener('click', () => {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
});

// Follow the OS only while nobody has picked a theme by hand.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  let saved = null;
  try { saved = localStorage.getItem('digimium_theme'); } catch {}
  if (!saved) setTheme(event.matches ? 'dark' : 'light');
});

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ------------------------------------------------------------------ auth flow */

function showLogin() {
  $('panel').hidden = true;
  $('loginScreen').hidden = false;
  $('passcode').value = '';
}

async function showPanel(session) {
  $('loginScreen').hidden = true;
  $('panel').hidden = false;
  $('pwNotice').hidden = !session.isDefault;

  state.storeUrl = session.storeUrl || '';
  $('viewStore').href = state.storeUrl || '#';

  if (session.storeError) {
    $('storeNotice').textContent = `Cannot load store data: ${session.storeError}`;
    $('storeNotice').hidden = false;
    return;
  }
  $('storeNotice').hidden = true;

  await Promise.all([loadSettings(), loadProducts(), loadOrders()]);
}

$('togglePasscode').addEventListener('click', () => {
  const field = $('passcode');
  const showing = field.type === 'text';
  field.type = showing ? 'password' : 'text';
  $('togglePasscode').innerHTML =
    `<svg class="icon" viewBox="0 0 24 24"><use href="#i-${showing ? 'eye' : 'eye-off'}" /></svg>`;
  field.focus();
});

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('loginError').hidden = true;
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ passcode: $('passcode').value })
    });
    $('passcode').value = '';
    await showPanel(await api('/api/me'));
  } catch (err) {
    $('loginError').textContent = err.message;
    $('loginError').hidden = false;
    $('passcode').value = '';
    $('passcode').focus();
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

/* ----------------------------------------------------------------------- tabs */

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab.dataset.tab;
    });
  });
});

/* ------------------------------------------------------------------- products */

async function loadProducts() {
  state.products = await api('/api/products');
  renderProducts();
}

function priceLabel(product) {
  if (product.variants?.length) {
    const prices = product.variants.map((v) => v.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? money(min) : `${money(min)} – ${money(max)}`;
  }
  return money(product.price);
}

function renderProducts() {
  const body = $('productTable').querySelector('tbody');
  $('noProducts').hidden = state.products.length > 0;
  $('productTable').parentElement.hidden = state.products.length === 0;

  body.innerHTML = state.products.map((p) => `
    <tr>
      <td>${thumb(p.image)}</td>
      <td><strong>${esc(p.name)}</strong></td>
      <td>${esc(p.category) || '—'}</td>
      <td>${priceLabel(p)}</td>
      <td>${p.stock === null || p.stock === undefined ? 'Unlimited' : p.stock}</td>
      <td>
        <span class="pill ${p.active === false ? 'pill-off' : 'pill-on'}">${p.active === false ? 'Hidden' : 'Live'}</span>
        ${p.promo ? '<span class="pill pill-promo">Promo</span>' : ''}
      </td>
      <td>
        <div class="row-actions">
          <button class="link-btn" data-edit="${p.id}">${icon('edit')} Edit</button>
          <button class="link-btn danger" data-delete="${p.id}">${icon('trash')} Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function variantRow(variant = { label: '', price: '' }) {
  const row = document.createElement('div');
  row.className = 'variant-row';
  row.innerHTML = `
    <input type="text" placeholder="1 Month" value="${esc(variant.label)}" data-variant-label />
    <input type="number" min="0" step="any" placeholder="Price" value="${variant.price}" data-variant-price />
    <button class="link-btn danger" type="button" data-remove-variant aria-label="Remove option">${icon('trash')}</button>
  `;
  row.querySelector('[data-remove-variant]').addEventListener('click', () => row.remove());
  return row;
}

function openProductModal(product) {
  const form = $('productForm');
  state.editingId = product?.id ?? null;
  $('productModalTitle').textContent = product ? 'Edit product' : 'New product';
  $('productError').hidden = true;
  form.reset();
  $('variantList').innerHTML = '';

  if (product) {
    form.name.value = product.name || '';
    form.category.value = product.category || '';
    form.badge.value = product.badge || '';
    form.description.value = product.description || '';
    form.price.value = product.price ?? 0;
    form.stock.value = product.stock === null || product.stock === undefined ? '' : product.stock;
    form.oldPrice.value = product.oldPrice === null || product.oldPrice === undefined ? '' : product.oldPrice;
    form.promo.checked = !!product.promo;
    form.image.value = product.image || '';
    form.active.checked = product.active !== false;
    (product.variants || []).forEach((v) => $('variantList').appendChild(variantRow(v)));
  } else {
    form.price.value = 0;
    form.active.checked = true;
    form.promo.checked = false;
  }

  updatePreview();
  $('productModal').hidden = false;
}

function closeProductModal() {
  $('productModal').hidden = true;
  state.editingId = null;
}

function updatePreview() {
  const url = $('productForm').image.value.trim();
  const preview = $('imagePreview');
  preview.hidden = !url;
  if (url) preview.src = imageSrc(url);
}

$('productForm').image.addEventListener('input', updatePreview);
$('newProduct').addEventListener('click', () => openProductModal(null));
$('cancelProduct').addEventListener('click', closeProductModal);
$('closeProduct').addEventListener('click', closeProductModal);
$('addVariant').addEventListener('click', () => $('variantList').appendChild(variantRow()));
$('uploadBtn').addEventListener('click', () => $('imageFile').click());

$('imageFile').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const body = new FormData();
  body.append('image', file);
  try {
    const data = await api('/api/upload', { method: 'POST', body });
    // Store the store-relative path; the preview resolves it for display.
    $('productForm').image.value = data.path;
    updatePreview();
    toast('Image uploaded');
  } catch (err) {
    toast(err.message);
  }
  event.target.value = '';
});

$('productForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const variants = [...$('variantList').querySelectorAll('.variant-row')]
    .map((row) => ({
      label: row.querySelector('[data-variant-label]').value.trim(),
      price: Number(row.querySelector('[data-variant-price]').value) || 0
    }))
    .filter((v) => v.label);

  const payload = {
    name: form.name.value.trim(),
    category: form.category.value.trim(),
    badge: form.badge.value.trim(),
    description: form.description.value.trim(),
    price: Number(form.price.value) || 0,
    stock: form.stock.value === '' ? null : Number(form.stock.value),
    oldPrice: form.oldPrice.value === '' ? null : Number(form.oldPrice.value),
    promo: form.promo.checked,
    image: form.image.value.trim(),
    active: form.active.checked,
    variants
  };

  try {
    if (state.editingId) {
      await api(`/api/products/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/api/products', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeProductModal();
    await loadProducts();
    toast('Product saved');
  } catch (err) {
    $('productError').textContent = err.message;
    $('productError').hidden = false;
  }
});

document.addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit]');
  if (edit) {
    return openProductModal(state.products.find((p) => p.id === Number(edit.dataset.edit)));
  }

  const del = event.target.closest('[data-delete]');
  if (del) {
    const product = state.products.find((p) => p.id === Number(del.dataset.delete));
    if (!confirm(`Delete "${product?.name}"? This cannot be undone.`)) return;
    try {
      await api(`/api/products/${del.dataset.delete}`, { method: 'DELETE' });
      await loadProducts();
      toast('Product deleted');
    } catch (err) {
      toast(err.message);
    }
    return;
  }

  const delOrder = event.target.closest('[data-delete-order]');
  if (delOrder) {
    if (!confirm('Delete this order?')) return;
    try {
      await api(`/api/orders/${delOrder.dataset.deleteOrder}`, { method: 'DELETE' });
      await loadOrders();
      toast('Order deleted');
    } catch (err) {
      toast(err.message);
    }
  }
});

/* --------------------------------------------------------------------- orders */

async function loadOrders() {
  state.orders = await api('/api/orders');
  renderOrders();
}

function renderOrders() {
  $('noOrders').hidden = state.orders.length > 0;
  $('orderCountLabel').textContent = state.orders.length
    ? `${state.orders.length} order${state.orders.length > 1 ? 's' : ''}`
    : '';

  $('orderList').innerHTML = state.orders.map((order) => `
    <article class="order-card">
      <div class="order-top">
        <strong>${esc(order.code)}</strong>
        <span class="pill pill-${esc(order.status)}">${esc(order.status)}</span>
        <span class="muted">${new Date(order.createdAt).toLocaleString()}</span>
        <select class="status-select" data-status="${order.id}" aria-label="Order status">
          ${['new', 'paid', 'delivered', 'cancelled'].map((s) => `
            <option value="${s}" ${s === order.status ? 'selected' : ''}>${s}</option>
          `).join('')}
        </select>
        <button class="link-btn danger" data-delete-order="${order.id}">${icon('trash')} Delete</button>
      </div>
      <ul class="order-items">
        ${order.items.map((item) => `
          <li>${esc(item.name)}${item.variant ? ` (${esc(item.variant)})` : ''} × ${item.quantity} — ${money(item.lineTotal)}</li>
        `).join('')}
      </ul>
      <div class="order-meta">
        <span class="order-total">${money(order.total)}</span>
        ${order.customer.name ? `<span>${icon('user')} ${esc(order.customer.name)}</span>` : ''}
        ${order.customer.contact ? `<span>${icon('phone')} ${esc(order.customer.contact)}</span>` : ''}
        ${order.customer.note ? `<span>${icon('note')} ${esc(order.customer.note)}</span>` : ''}
      </div>
    </article>
  `).join('');
}

document.addEventListener('change', async (event) => {
  const select = event.target.closest('[data-status]');
  if (!select) return;
  try {
    await api(`/api/orders/${select.dataset.status}`, {
      method: 'PUT',
      body: JSON.stringify({ status: select.value })
    });
    await loadOrders();
    toast('Order updated');
  } catch (err) {
    toast(err.message);
  }
});

/* ------------------------------------------------------------------- settings */

async function loadSettings() {
  state.settings = await api('/api/settings');
  const form = $('settingsForm');
  Object.entries(state.settings).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value ?? '';
  });
}

$('settingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  try {
    state.settings = await api('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
    renderProducts();
    renderOrders();
    toast('Store info saved');
  } catch (err) {
    toast(err.message);
  }
});

/* -------------------------------------------------------------------- account */

$('passcodeForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if ($('newPasscode').value !== $('confirmPasscode').value) {
    return toast('New passcodes do not match');
  }
  try {
    await api('/api/passcode', {
      method: 'POST',
      body: JSON.stringify({
        currentPasscode: $('currentPasscode').value,
        newPasscode: $('newPasscode').value
      })
    });
    event.target.reset();
    $('pwNotice').hidden = true;
    toast('Passcode changed');
  } catch (err) {
    toast(err.message);
  }
});

/* ----------------------------------------------------------------------- init */

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeProductModal();
});

(async function init() {
  setTheme(currentTheme());
  try {
    await showPanel(await api('/api/me'));
  } catch {
    showLogin();
    $('passcode').focus();
  }
})();
