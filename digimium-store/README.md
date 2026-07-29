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
3. Copies the order to the clipboard and opens **your own chat** in one step, with no dialog in between. The customer pastes and sends.

   Which link depends on the device. On a phone it uses `t.me/<you>`, which hands off to the Telegram app. On a desktop browser `t.me` bounces to `telegram.org/dl` unless Telegram Desktop is registered as a URL handler, so desktop visitors get `web.telegram.org/k/#@<you>` instead, which opens the chat directly. The handle is read from your **Telegram link**, so keeping that correct is enough. Lines read `Spotify Premium (Family · 12 Months)` so the plan and duration are unambiguous.
4. Sends the same message to your bot too, if you configured one.

The Telegram tab is opened during the click itself, before the order request is awaited, so browsers do not treat it as a popup.

**A `t.me/username` link cannot carry a message** — that is a Telegram limitation. So on a browser that refuses clipboard access (private windows, some in-app browsers) the customer arrives in your chat with nothing pasted. Two things cover that: the order is saved **before** Telegram opens, so it is in the admin **Orders** tab either way, and with `TELEGRAM_BOT_TOKEN` set it also arrives in your Telegram automatically. Setting up the bot is worth it for exactly this reason.

If you would rather the message arrive already written and let the customer choose the chat, the order response also returns `shareUrl`; use it instead of `telegramUrl` in `checkout()` in `public/js/app.js`.

## Promotion area

A band between the hero and the product grid showing whichever products you are promoting. It needs two things, both set in the admin panel:

**1. The products.** In the product editor tick **Feature in the promotion area**. Fill in **Old price** as well and the card gains a red *Sale* badge with the original price struck through above the current one. Leave Old price blank to feature a product without implying a discount.

**2. The heading.** *Store info → Promotion banner* holds the small tag, headline, text and an optional button. Set **Show the banner** to *On* to publish the section.

The section only renders when the switch is *On* **and** at least one product is flagged, so it can never appear as an empty band. The button link accepts `#products` to scroll to the grid, or any URL to open in a new tab.

A promoted product appears twice on the page, once in the promo row and once in the grid. Each copy keeps its own option picker and price, and adding to the cart reads the card that was actually clicked.

## Product fields

Edited in the admin app, stored here:

- **Base price** — used when the product has no options.
- **Pricing** — two shapes, chosen with the *Pricing* dropdown in the editor:
  - **One plan with durations** — a flat list, e.g. `1 Month / 12000`, `3 Months / 32000`. The card shows a single picker.
  - **Several plans, each with its own durations** — e.g. Spotify with *Individual* and *Family*, each priced across `1 / 2 / 3 / 12 Months`. The card shows two pickers: plan first, then duration. Switching plan rebuilds the duration list, since each plan prices its own.

  Each plan carries its own **description**, shown on the card and in the detail view when that plan is selected. Leave it blank and the product description is used instead.

  Prices are always resolved from the stored product, so a plan and duration sent by the browser can never set the price. An unknown plan or duration falls back to the first one rather than erroring, which keeps a stale cart working after you rename something.
- **Short text** — one line, shown on the card in the grid. Keep it to a few words.
- **Full details** — the longer text shown when the card is opened. Line breaks are preserved, so a bulleted list works.

  Plans have their own **Short text** and **Full details** too, and both follow the selected plan. A blank plan field falls back to the product's own text.
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
- **The reader's system sans** — everything else. `--font` is a plain stack (`-apple-system, Segoe UI, Roboto, Helvetica Neue, Arial`), so text renders in San Francisco on Apple devices, Segoe UI on Windows and Roboto on Android. Nothing is downloaded, so body text paints immediately.
- **Z06-Walone** — fallback only. The system sans has no Myanmar glyphs, so Burmese text falls through to Walone automatically; the file is not fetched unless a page actually contains Burmese. Product and plan descriptions are written in Burmese, so it loads on the storefront in practice.

Weights used are 300 (display), 400 (body) and 700 (emphasis). Every system face above covers them.

To pin one face across all platforms instead, install a webfont (`npm i @fontsource/<name>`), copy its `-latin-300/400/700-normal.woff2` files into `public/fonts/`, add three `@font-face` blocks, and put the family first in `--font` at the top of `public/css/style.css`.

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
