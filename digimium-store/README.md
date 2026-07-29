# digimium — store

The public storefront for digital products, with a Telegram checkout. It owns all the data; the admin panel is a **separate app** ([digimium-admin](../digimium-admin)) hosted on its own URL.

- **Storefront** — products with categories, duration/option variants, product detail view, cart, checkout
- **Light & dark mode** — follows the visitor's OS, switchable from the header, remembered per browser
- **Checkout** — the order is saved, formatted as a message, copied to the clipboard, and Telegram opens so the customer just pastes and sends
- **Internal API** — key-protected endpoints the admin app uses to manage products, prices, settings and orders
- **Storage** — plain JSON files in `data/`. No database to install.

## Run it

```bash
cd digimium-store && npm install && npm start
```

The store runs at http://localhost:3000. There is no admin UI here by design — run [digimium-admin](../digimium-admin) for that.

## Configuration

Copy `.env.example` to `.env` and edit it:

| Variable | What it does |
| --- | --- |
| `PORT` | Port to run on (default 3000) |
| `STORE_API_KEY` | Shared secret the admin app authenticates with. **Until this is set the internal API is disabled**, so the admin panel cannot connect. |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ADMIN_CHAT_ID` | Optional — pushes every new order into your Telegram automatically |
| `NODE_ENV` | Set to `production` when behind HTTPS |

Generate the key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the same value into the admin app's `.env`. Everything else is edited in the admin panel under **Store info**, with no code changes: store name, currency, tagline, description, announcement bar, Telegram username and checkout link, Telegram channel, two Facebook pages, phone and email.

The two Facebook slots each take a link plus a **name shown to customers**. That name becomes the contact card title, which matters because a `profile.php?id=...` link has nothing readable in it. Leave a name blank and the card falls back to "Facebook page" / "Facebook page 2".

### Optional: get orders pushed to you automatically

By default the customer pastes the order into your Telegram chat. To also receive every order instantly, even if the customer never sends the message:

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token into `TELEGRAM_BOT_TOKEN`.
2. Send your new bot any message.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates`, find `"chat":{"id":...}`, put that number in `TELEGRAM_ADMIN_CHAT_ID`.
4. Restart the server.

## How checkout works

`https://t.me/username` links cannot pre-fill a message — that is a Telegram limitation, not a bug here. So on checkout the app:

1. Validates the cart **server-side** and recalculates the total from stored prices (a customer cannot edit prices in the browser).
2. Saves the order to `data/orders.json`, where the admin app reads it.
3. Copies a formatted order message to the clipboard and opens your Telegram chat.
4. Sends the same message to your bot too, if you configured one.

## Product fields

Edited in the admin app, stored here:

- **Base price** — used when the product has no options.
- **Options / durations** — e.g. `1 Month / 12000`, `3 Months / 32000`. The customer picks one and the card price updates to match.
- **Description** — the card shows the first two lines; the full text appears in the product detail view when a customer taps the card.
- **Stock** — leave blank for unlimited. `0` shows "Sold out".
- **Visible in the store** — uncheck to hide a product without deleting it.
- **Image** — upload a file or paste a URL.

## Deploying

Any host that runs Node works (Railway, Render, Fly, a VPS). Requirements:

- Set `STORE_API_KEY` and `NODE_ENV=production`.
- Keep `data/` and `public/uploads/` on a **persistent disk** — they hold your products, orders and images.
- Deploy the admin app separately, pointing `STORE_URL` at this app's public URL.

## Brand

Everything visual is driven by CSS custom properties at the top of `public/css/style.css`.

**Colours** — sampled directly from the official logo gradient:

| Token | Value | Used for |
| --- | --- | --- |
| `--blue` | `#1A43BD` | gradient start, links, focus rings |
| `--navy` | `#051650` | gradient end, text, footer, announcement bar |
| `--gradient` | `linear-gradient(135deg, #1A43BD, #051650)` | the hero panel only |
| `--action` | `#1A43BD` light / `#3358DE` dark | buttons, cart badge, contact icons |
| `--surface` | `#F6F8FD` | section tints |
| `--line` | `#E3E9F6` | hairlines and borders |

Buttons use a flat `--action` colour rather than the gradient: on a small control the gradient reads as two tones, as though the surface behind it were showing through.

Each theme is one block of custom properties. `--band` is the dark contrast surface (announcement bar, footer, active chips, badges, toast); `--page` is the page behind `--card`.

**Themes** — light and dark. An inline script in `<head>` stamps `data-theme` on `<html>` before first paint, so there is no flash of the wrong theme. The choice is saved in `localStorage.digimium_theme`; until the visitor picks one, the site follows their OS setting live. The header button shows the theme it will switch *to*.

**Type** — self-hosted in `public/fonts/`:

- **Gunken** — the `digimium.` wordmark only (header, hero, footer, admin header). Applied via `.wordmark` / `--font-brand`.
- **Outfit Light (300)** — large display text: hero subheading, section headings.
- **Outfit Regular (400)** — body copy, descriptions, form fields.
- **Outfit Bold (700)** — product names, prices, buttons, table values, badges.
- **Z06-Walone** — fallback only. Outfit has no Myanmar glyphs, so Burmese text falls through to Walone automatically; it is not downloaded unless a page actually contains Burmese.

To swap Outfit for another face: `npm i @fontsource/<name>`, copy the `-latin-300/400/700-normal.woff2` files into `public/fonts/`, and change the three `@font-face` blocks plus `--font` at the top of `public/css/style.css`.

**Logo** — `public/assets/`: `logo-mark.png` (blue mark), `logo-mark-white.png` (on the gradient), `logo-lockup*.png` (horizontal lockups, used for link previews), `favicon.png`. Originals live in your iCloud brand kit under `digimium rebranding/Digimium/logo png/`.

**Product images** — usually brand logos, so they are letterboxed (`object-fit: contain` with padding on a tinted tile) rather than cropped. The tile uses `--tile`, which stays light in **both** themes: some brand marks are black, and on a dark tile they would disappear. Products without an image fall back to the digimium mark.

Logos for the products currently on sale live in `public/assets/products/`. To add another, drop the file there and point the product's Image field at `/assets/products/<file>`, or just use the Upload button in the admin panel.

**Icons** — no emoji anywhere. Every icon is an inline SVG `<symbol>` defined once at the top of `index.html` and `admin/index.html`, drawn in `currentColor`. To add one, drop a new `<g id="i-yourname">` in that block and call `icon('yourname')` from JS.

## Layout

```
server.js           Express app: public API + key-protected internal API
lib/db.js           JSON file storage with atomic writes
data/               products.json, settings.json, orders.json, admin.json
public/             storefront (index.html, css/, js/)
public/assets/      logo marks, lockups, favicon
public/fonts/       Gunken + Z06-Walone (Thin / Regular / Bold)
public/uploads/     uploaded product images
```

## Internal API

Used only by the admin app. Every route needs `x-api-key: <STORE_API_KEY>` and returns 401 without it. If `STORE_API_KEY` is unset, all of them return 503.

| Method | Route |
| --- | --- |
| GET | `/api/internal/ping` |
| GET, POST | `/api/internal/products` |
| PUT, DELETE | `/api/internal/products/:id` |
| GET, PUT | `/api/internal/settings` |
| GET | `/api/internal/orders` |
| PUT, DELETE | `/api/internal/orders/:id` |
| POST | `/api/internal/upload` (multipart, field `image`) |

The public routes — `GET /api/products`, `GET /api/settings`, `POST /api/orders` — need no key and are what the storefront itself uses.
