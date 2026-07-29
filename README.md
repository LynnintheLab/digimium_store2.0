# digimium 2.0

Two Node apps that make up the digimium digital-goods shop.

| Folder | What it is | Runs on |
| --- | --- | --- |
| [`digimium-store`](digimium-store) | Public storefront with Telegram checkout. Owns all data and uploaded images. | 3000 |
| [`digimium-admin`](digimium-admin) | Passcode-locked admin panel. Holds no data; talks to the store over its internal API. | 4000 |

They are separate apps on purpose so the admin panel can live on its own URL. Each has its own README with full setup notes.

```
customer  ──>  digimium-store   (your public domain)      owns data/ and /uploads
                     ▲
                     │  HTTPS + STORE_API_KEY
                     │
you       ──>  digimium-admin   (a different domain)      passcode login only
```

## Run both locally

```bash
npm run install:all
```

Then in two terminals:

```bash
npm run start:store
```

```bash
npm run start:admin
```

Store on http://localhost:3000, admin on http://localhost:4000.

## Before the first run

Neither app ships with its secrets — copy the examples and fill them in:

```bash
cp digimium-store/.env.example digimium-store/.env && cp digimium-admin/.env.example digimium-admin/.env
```

Generate a key and paste the **same** value into `STORE_API_KEY` in both files, then give the admin its own `SESSION_SECRET` and `ADMIN_PASSCODE`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Without a matching `STORE_API_KEY` the admin panel loads but cannot read or write anything.

## Deploying to Hostinger

Deploy the folders as **two separate applications** pointing at this same repository:

| Setting | Store | Admin |
| --- | --- | --- |
| Root / app directory | `digimium-store` | `digimium-admin` |
| Build | `npm install` | `npm install` |
| Start | `npm start` | `npm start` |
| Domain | `digimium.com` | `admin.digimium.com` |

Then set the environment variables per app (see each README). Two rules that matter:

- `STORE_URL` on the admin must be the store's **public https URL**, not localhost.
- `NODE_ENV=production` on both, so cookies are marked secure.

If your host insists on running from the repository root instead, `npm start` at the root launches the storefront.

### Keep these on a persistent disk

`digimium-store/data/` and `digimium-store/public/uploads/` hold your products, orders and product images. `digimium-admin/data/` holds your passcode hash. On a host with an ephemeral filesystem these reset on every deploy.

## What is not in this repo

`.env` files, saved orders and the admin passcode hash are gitignored. Nothing here contains a secret, so this repository is safe to keep public — but see the note on fonts below.

### Fonts and brand marks

`public/fonts/` carries **Gunken** and **Z06-Walone**, which are third-party fonts, and `digimium-store/public/assets/products/` carries the Canva, OpenAI and Zoom logos. Everything else is set in the reader's own system font, so nothing more is redistributed. Check the licences on those two fonts before leaving this repository public — some commercial fonts forbid redistribution even inside a project.
