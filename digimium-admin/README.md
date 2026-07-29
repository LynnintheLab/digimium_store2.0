# digimium — admin

The admin panel for the digimium store, as a **separate app on its own URL**. It holds no data of its own: it signs you in with a passcode, then reads and writes the store's data over the store's internal API.

```
customer  ──>  digimium-store   (your public domain)      owns data/ and /uploads
                     ▲
                     │  HTTPS + STORE_API_KEY
                     │
you       ──>  digimium-admin   (a different domain)      passcode login only
```

Because it talks to the store over HTTP, the two apps can live on completely different hosts.

## Run it

```bash
cd digimium-admin && npm install && npm start
```

Open http://localhost:4000 and enter your passcode.

## Configuration

Copy `.env.example` to `.env`:

| Variable | What it does |
| --- | --- |
| `PORT` | Port to run on (default 4000) |
| `STORE_URL` | Where the store lives, e.g. `https://digimium.com` — no trailing slash |
| `STORE_API_KEY` | **Must match `STORE_API_KEY` in the store's `.env` exactly.** This is what lets the admin write to the store. |
| `SESSION_SECRET` | Long random string. Without it you are logged out every restart. |
| `ADMIN_PASSCODE` | Your login passcode, used only on first start |
| `NODE_ENV` | Set to `production` behind HTTPS so the session cookie is marked secure |

Generate the key and secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Look & feel

The panel shares the storefront design system (same tokens, same Gunken + Outfit type) but carries its own copy of the CSS, fonts and logo marks in `public/` so it can be deployed on its own with no dependency on the store.

Light and dark mode both work here too: the header button switches, an inline script stamps the theme before first paint, and the preference is stored in `localStorage.digimium_theme` per browser.

## The passcode

One passcode unlocks the panel — a **PIN** (digits) or a **password**, minimum 6 characters. Change it any time on the **Account** tab; it is stored as a bcrypt hash in `data/admin.json`, never in plain text.

Protections in place:

- **6 wrong attempts locks that IP out for 15 minutes**, with the remaining attempts shown so you are not locked out by accident.
- Obvious codes (`111111`, `123456`, and similar) are rejected when you change it.
- The session cookie is `httpOnly` (JavaScript cannot read it) and expires after 8 hours.

A 6-digit PIN is 1,000,000 combinations — fine against a human, weak against a machine if the lockout is ever bypassed. **For a panel exposed to the open internet, use a long password rather than a short PIN**, and see the hardening notes below.

## Deploying

1. Deploy the store first and set `STORE_API_KEY` in its `.env`.
2. Deploy this app to a **different** URL — `admin.digimium.com`, a separate Railway/Render service, whatever you like.
3. Set `STORE_URL` to the store's public https URL and paste the **same** `STORE_API_KEY`.
4. Set `NODE_ENV=production` and a strong `ADMIN_PASSCODE`.
5. Load the admin URL — the header shows a red banner if it cannot reach the store, which usually means a wrong `STORE_URL` or a mismatched key.

`data/` only holds your passcode hash. Keep it on a persistent disk so you do not fall back to the `ADMIN_PASSCODE` value after every deploy.

### Worth doing if this is public

- **Serve it over HTTPS.** The passcode is sent in the request body; without TLS it travels in the clear.
- **Do not link to the admin URL from the storefront.** The public site has no link to it on purpose, and the page sends `noindex, nofollow`.
- **Rotate `STORE_API_KEY`** if it ever leaks — change it in both `.env` files and restart both apps.
- The lockout counter lives in memory, so a restart clears it. If you expect real attack traffic, put the admin behind your host's own auth (Cloudflare Access, basic auth at the proxy) as a second layer.

## What each app owns

| | store | admin |
| --- | --- | --- |
| Products, settings, orders | **owns** (`data/`) | reads/writes over the API |
| Uploaded images | **owns** (`/uploads`) | relays the file, stores the path |
| Public storefront | serves it | — |
| Passcode | — | **owns** (`data/admin.json`) |

Product images are saved on the **store** so customers load them from the storefront's own domain; the admin only keeps the relative path (`/uploads/…`) and resolves it against `STORE_URL` for previews. That means changing the store domain never breaks your product images.
