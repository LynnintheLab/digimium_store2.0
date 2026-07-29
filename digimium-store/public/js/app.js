/* digimium — storefront */

const state = {
  settings: {},
  products: [],
  category: 'All',
  cart: loadCart(),
  detailId: null
};

const $ = (id) => document.getElementById(id);

const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}" /></svg>`;

/* ------------------------------------------------------------------ utilities */

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem('digimium_cart') || '[]');
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem('digimium_cart', JSON.stringify(state.cart));
}

function money(amount) {
  return `${Number(amount).toLocaleString('en-US')} ${state.settings.currency || ''}`.trim();
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Renders the store name in the brand face with the accent full stop.
function wordmark(name) {
  return `${esc(name)}<span class="dot">.</span>`;
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
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

// Follow the OS only while the visitor has not picked a theme themselves.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  let saved = null;
  try { saved = localStorage.getItem('digimium_theme'); } catch {}
  if (!saved) setTheme(event.matches ? 'dark' : 'light');
});

/* --------------------------------------------------------------------- render */

function applySettings() {
  const s = state.settings;
  document.title = s.storeName || 'digimium';
  $('brandName').innerHTML = wordmark(s.storeName);
  $('heroTitle').innerHTML = wordmark(s.storeName);
  $('footerName').innerHTML = wordmark(s.storeName);
  $('heroDesc').textContent = s.description || s.tagline || '';
  $('year').textContent = new Date().getFullYear();
  $('checkoutHint').textContent = s.checkoutNote || '';

  if (s.announcement) {
    $('announcement').textContent = s.announcement;
    $('announcement').hidden = false;
  }
  if (s.telegramUrl) $('heroTelegram').href = s.telegramUrl;

  renderPromo();
  renderContacts();
}

// The promo band only appears once it is switched on and has something to say.
function renderPromo() {
  const s = state.settings;
  const hasContent = s.promoTitle || s.promoText || s.promoImage;
  if (s.promoActive !== 'on' || !hasContent) {
    $('promo').hidden = true;
    return;
  }

  $('promoTag').textContent = s.promoTag || '';
  $('promoTag').hidden = !s.promoTag;
  $('promoTitle').textContent = s.promoTitle || '';
  $('promoTitle').hidden = !s.promoTitle;
  $('promoText').textContent = s.promoText || '';
  $('promoText').hidden = !s.promoText;

  $('promoMedia').innerHTML = s.promoImage
    ? `<img src="${esc(s.promoImage)}" alt="${esc(s.promoTitle || 'Promotion')}" loading="lazy" />`
    : '';
  $('promoMedia').hidden = !s.promoImage;

  const link = $('promoLink');
  link.hidden = !s.promoLink;
  if (s.promoLink) {
    link.href = s.promoLink;
    link.textContent = s.promoLinkLabel || 'See the offer';
    const external = !s.promoLink.startsWith('#');
    link.target = external ? '_blank' : '';
    link.rel = external ? 'noopener' : '';
  }

  $('promo').hidden = false;
}

// Raw URLs read as noise in a contact card, so show the handle where there is
// one. Numeric Facebook profile links carry no readable name at all.
function linkLabel(url) {
  try {
    const { hostname, pathname, searchParams } = new URL(url);
    const handle = pathname.replace(/^\/+|\/+$/g, '');
    if (/(^|\.)t\.me$/.test(hostname) && handle) return `@${handle}`;
    if (/facebook\.com$/.test(hostname)) {
      return handle && handle !== 'profile.php' ? `@${handle}` : 'Open on Facebook';
    }
    if (searchParams.toString()) return hostname.replace(/^www\./, '');
    return `${hostname.replace(/^www\./, '')}${handle ? `/${handle}` : ''}`;
  } catch {
    return url;
  }
}

function renderContacts() {
  const s = state.settings;
  const links = [];

  if (s.telegramUrl) {
    links.push({
      icon: 'telegram',
      label: 'Telegram — order & support',
      value: s.telegramUsername ? `@${s.telegramUsername.replace(/^@/, '')}` : s.telegramUrl,
      href: s.telegramUrl
    });
  }
  if (s.telegramChannel) {
    links.push({ icon: 'telegram', label: 'Telegram channel', value: linkLabel(s.telegramChannel), href: s.telegramChannel });
  }
  if (s.facebookPage) {
    links.push({
      icon: 'facebook',
      label: s.facebookLabel || 'Facebook page',
      value: linkLabel(s.facebookPage),
      href: s.facebookPage
    });
  }
  if (s.facebookPage2) {
    links.push({
      icon: 'facebook',
      label: s.facebookLabel2 || 'Facebook page 2',
      value: linkLabel(s.facebookPage2),
      href: s.facebookPage2
    });
  }
  if (s.phone) {
    links.push({ icon: 'phone', label: 'Phone', value: s.phone, href: `tel:${s.phone}` });
  }
  if (s.email) {
    links.push({ icon: 'mail', label: 'Email', value: s.email, href: `mailto:${s.email}` });
  }

  $('contactGrid').innerHTML = links.map((link) => `
    <a class="contact-card" href="${esc(link.href)}" target="_blank" rel="noopener">
      <span class="contact-icon">${icon(link.icon)}</span>
      <span class="contact-meta">
        <strong>${esc(link.label)}</strong>
        <span>${esc(link.value)}</span>
      </span>
    </a>
  `).join('');
}

function categories() {
  const set = new Set(state.products.map((p) => p.category).filter(Boolean));
  return ['All', ...set];
}

function renderFilters() {
  const list = categories();
  $('filters').innerHTML = list.length > 1
    ? list.map((cat) => `
        <button class="chip ${cat === state.category ? 'active' : ''}" data-cat="${esc(cat)}">${esc(cat)}</button>
      `).join('')
    : '';
}

// With variants the price shown is whichever option is selected.
function priceFor(product, variantLabel) {
  if (product.variants?.length) {
    const variant = product.variants.find((v) => v.label === variantLabel);
    return (variant || product.variants[0]).price;
  }
  return product.price;
}

function isSoldOut(product) {
  return product.stock !== null && product.stock !== undefined && product.stock <= 0;
}

// Falls back to the brand mark when a product has no image. The tile behind it
// is light in both themes, so the blue mark is always the right one.
function media(image, alt) {
  return image
    ? `<img class="photo" src="${esc(image)}" alt="${esc(alt || '')}" loading="lazy" />`
    : '<img class="mark" src="/assets/logo-mark.png" alt="" />';
}

function renderProducts() {
  const list = state.category === 'All'
    ? state.products
    : state.products.filter((p) => p.category === state.category);

  $('emptyState').hidden = list.length > 0;

  $('productGrid').innerHTML = list.map((p) => {
    const options = p.variants?.length
      ? `<select class="card-select" data-variant-for="${p.id}" aria-label="Choose an option for ${esc(p.name)}">
           ${p.variants.map((v) => `<option value="${esc(v.label)}">${esc(v.label)}</option>`).join('')}
         </select>`
      : '';

    return `
      <article class="card" data-open="${p.id}" tabindex="0" role="button"
               aria-label="View details for ${esc(p.name)}">
        <div class="card-media">
          ${media(p.image, p.name)}
          ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
        </div>
        <div class="card-body">
          ${p.category ? `<span class="card-cat">${esc(p.category)}</span>` : ''}
          <h3 class="card-title">${esc(p.name)}</h3>
          ${p.description ? `<p class="card-desc">${esc(p.description)}</p>` : ''}
          ${options}
          <div class="card-foot">
            <span class="price" data-price-for="${p.id}">${money(priceFor(p))}</span>
            ${isSoldOut(p)
              ? '<span class="sold-out">Sold out</span>'
              : `<button class="btn btn-primary" data-add="${p.id}">Add</button>`}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

/* --------------------------------------------------------------- detail modal */

function openDetail(productId) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  state.detailId = productId;
  $('detailMedia').innerHTML = media(product.image, product.name) +
    (product.badge ? `<span class="badge">${esc(product.badge)}</span>` : '');
  $('detailCat').textContent = product.category || '';
  $('detailCat').hidden = !product.category;
  $('detailName').textContent = product.name;
  $('detailDesc').textContent = product.description || 'No description yet.';

  const hasVariants = !!product.variants?.length;
  $('detailOptions').hidden = !hasVariants;
  if (hasVariants) {
    // Start from whatever the card was showing so the two stay in step.
    const card = document.querySelector(`[data-variant-for="${productId}"]`);
    $('detailVariant').innerHTML = product.variants
      .map((v) => `<option value="${esc(v.label)}">${esc(v.label)} — ${money(v.price)}</option>`)
      .join('');
    $('detailVariant').value = card ? card.value : product.variants[0].label;
  }

  const soldOut = isSoldOut(product);
  $('detailStock').hidden = product.stock === null || product.stock === undefined;
  $('detailStock').textContent = soldOut ? 'Out of stock' : `${product.stock} left in stock`;
  $('detailAdd').disabled = soldOut;
  $('detailAdd').textContent = soldOut ? 'Sold out' : 'Add to cart';

  updateDetailPrice();
  $('detailModal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function updateDetailPrice() {
  const product = state.products.find((p) => p.id === state.detailId);
  if (!product) return;
  const variant = product.variants?.length ? $('detailVariant').value : '';
  $('detailPrice').textContent = money(priceFor(product, variant));
}

function closeDetail() {
  $('detailModal').hidden = true;
  state.detailId = null;
  if ($('cartDrawer').hidden) document.body.style.overflow = '';
}

$('detailVariant').addEventListener('change', updateDetailPrice);

$('detailAdd').addEventListener('click', () => {
  const product = state.products.find((p) => p.id === state.detailId);
  if (!product) return;
  const variant = product.variants?.length ? $('detailVariant').value : '';
  addToCart(product.id, variant);
  // Mirror the choice back onto the card so its price matches the cart.
  const card = document.querySelector(`[data-variant-for="${product.id}"]`);
  if (card && variant) {
    card.value = variant;
    card.dispatchEvent(new Event('change', { bubbles: true }));
  }
  closeDetail();
});

/* ----------------------------------------------------------------------- cart */

function cartKey(id, variant) {
  return `${id}::${variant || ''}`;
}

function addToCart(productId, variantLabel) {
  const product = state.products.find((p) => p.id === productId);
  if (!product) return;

  const variant = variantLabel !== undefined
    ? variantLabel
    : (document.querySelector(`[data-variant-for="${productId}"]`)?.value || '');
  const unitPrice = priceFor(product, variant);
  const key = cartKey(productId, variant);
  const existing = state.cart.find((item) => item.key === key);

  if (existing) {
    existing.quantity = Math.min(99, existing.quantity + 1);
  } else {
    state.cart.push({
      key,
      id: productId,
      name: product.name,
      image: product.image,
      variant,
      unitPrice,
      quantity: 1
    });
  }

  saveCart();
  renderCart();
  toast(`${product.name} added to cart`);
}

function changeQty(key, delta) {
  const item = state.cart.find((i) => i.key === key);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity < 1) {
    state.cart = state.cart.filter((i) => i.key !== key);
  }
  saveCart();
  renderCart();
}

function removeItem(key) {
  state.cart = state.cart.filter((i) => i.key !== key);
  saveCart();
  renderCart();
}

function cartTotal() {
  return state.cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  $('cartCount').textContent = count;
  $('cartTotal').textContent = money(cartTotal());
  $('checkoutBtn').disabled = count === 0;

  $('cartItems').innerHTML = state.cart.length
    ? state.cart.map((item) => `
        <div class="cart-item">
          <span class="cart-thumb">${media(item.image, item.name)}</span>
          <div class="cart-info">
            <strong>${esc(item.name)}</strong>
            ${item.variant ? `<span>${esc(item.variant)}</span>` : ''}
            <div class="qty">
              <button data-qty="${esc(item.key)}" data-delta="-1" aria-label="Decrease quantity">${icon('minus', 'icon-sm')}</button>
              <span>${item.quantity}</span>
              <button data-qty="${esc(item.key)}" data-delta="1" aria-label="Increase quantity">${icon('plus', 'icon-sm')}</button>
            </div>
          </div>
          <div class="cart-right">
            <strong>${money(item.unitPrice * item.quantity)}</strong>
            <button class="remove" data-remove="${esc(item.key)}">Remove</button>
          </div>
        </div>
      `).join('')
    : '<p class="empty">Your cart is empty.</p>';
}

function openCart() {
  $('cartDrawer').hidden = false;
  $('overlay').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  $('cartDrawer').hidden = true;
  $('overlay').hidden = true;
  if ($('detailModal').hidden) document.body.style.overflow = '';
}

/* ------------------------------------------------------------------- checkout */

async function checkout(event) {
  event.preventDefault();
  if (!state.cart.length) return;

  const btn = $('checkoutBtn');
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Preparing order…';

  // Opened inside the click gesture, otherwise the browser blocks it as a popup
  // once the order request has been awaited.
  const telegramTab = window.open('', '_blank');

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: state.cart.map((item) => ({
          id: item.id,
          variant: item.variant,
          quantity: item.quantity
        })),
        name: $('custName').value,
        contact: $('custContact').value,
        note: $('custNote').value
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not place the order');

    const copied = await copyText(data.message);

    state.cart = [];
    saveCart();
    renderCart();
    closeCart();

    if (copied) {
      // Straight to Telegram — the order is already on the clipboard.
      if (telegramTab) telegramTab.location.href = data.telegramUrl;
      else window.location.href = data.telegramUrl;
      toast(`Order ${data.order.code} copied — paste it in Telegram to confirm`);
      return;
    }

    // Clipboard blocked: fall back to showing the text so it can be copied by hand.
    if (telegramTab) telegramTab.close();
    $('orderCode').textContent = `Order ${data.order.code} · ${money(data.order.total)}`;
    $('orderPreview').textContent = data.message;
    $('openTelegram').href = data.telegramUrl;
    $('orderHint').textContent = 'Copy the order below, then open Telegram and paste it.';
    $('orderModal').hidden = false;
    $('copyAgain').onclick = async () => {
      toast((await copyText(data.message)) ? 'Order copied' : 'Copy failed — select the text manually');
    };
  } catch (err) {
    if (telegramTab) telegramTab.close();
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = label;
  }
}

/* --------------------------------------------------------------------- events */

document.addEventListener('click', (event) => {
  const add = event.target.closest('[data-add]');
  if (add) {
    event.stopPropagation();
    return addToCart(Number(add.dataset.add));
  }

  const chip = event.target.closest('[data-cat]');
  if (chip) {
    state.category = chip.dataset.cat;
    renderFilters();
    renderProducts();
    return;
  }

  const qty = event.target.closest('[data-qty]');
  if (qty) return changeQty(qty.dataset.qty, Number(qty.dataset.delta));

  const remove = event.target.closest('[data-remove]');
  if (remove) return removeItem(remove.dataset.remove);

  // The option picker lives inside the card, so it must not open the detail view.
  const card = event.target.closest('[data-open]');
  if (card && !event.target.closest('.card-select')) {
    openDetail(Number(card.dataset.open));
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest?.('[data-open]');
  if (!card || event.target.closest('.card-select, .btn')) return;
  event.preventDefault();
  openDetail(Number(card.dataset.open));
});

// Keep the card price in step with the chosen option.
document.addEventListener('change', (event) => {
  const select = event.target.closest('[data-variant-for]');
  if (!select) return;
  const id = Number(select.dataset.variantFor);
  const product = state.products.find((p) => p.id === id);
  const label = document.querySelector(`[data-price-for="${id}"]`);
  if (product && label) label.textContent = money(priceFor(product, select.value));
});

$('cartBtn').addEventListener('click', openCart);
$('closeCart').addEventListener('click', closeCart);
$('overlay').addEventListener('click', closeCart);
$('checkoutForm').addEventListener('submit', checkout);
$('closeDetail').addEventListener('click', closeDetail);
$('detailModal').addEventListener('click', (event) => {
  if (event.target === $('detailModal')) closeDetail();
});
$('closeModal').addEventListener('click', () => { $('orderModal').hidden = true; });
$('orderModal').addEventListener('click', (event) => {
  if (event.target === $('orderModal')) $('orderModal').hidden = true;
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  closeCart();
  closeDetail();
  $('orderModal').hidden = true;
});

/* ----------------------------------------------------------------------- init */

(async function init() {
  try {
    const [settings, products] = await Promise.all([
      fetch('/api/settings').then((r) => r.json()),
      fetch('/api/products').then((r) => r.json())
    ]);
    state.settings = settings;
    state.products = products;
  } catch {
    toast('Could not load the store. Please refresh.');
  }

  setTheme(currentTheme());
  applySettings();
  renderFilters();
  renderProducts();

  // Drop cart lines whose product was removed in the admin panel.
  state.cart = state.cart.filter((item) => state.products.some((p) => p.id === item.id));
  saveCart();
  renderCart();
})();
