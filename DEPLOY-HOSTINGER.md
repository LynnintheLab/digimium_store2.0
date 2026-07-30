# Deploying digimium on Hostinger

Two apps, two URLs, one repository:

| App | Suggested domain | Port |
| --- | --- | --- |
| `digimium-store` | `digimium.com` | 3000 |
| `digimium-admin` | `admin.digimium.com` | 4000 |

## Which plan you need

Node.js apps run on **Business web hosting**, any **Cloud** plan, or a **VPS**. They do **not** run on Premium or Single shared hosting — those serve PHP and static files only, so the Git feature there would upload the code and never start it.

Two things this project needs that you must confirm before committing to a plan:

1. **Environment variables.** The store and admin authenticate to each other with a shared key. Without a way to set env vars you would have to hardcode secrets into the repository, which is not acceptable for a public repo.
2. **Files that survive a deploy.** `digimium-store/data/*.json` holds your products, settings and orders, and `digimium-store/public/uploads/` holds product images. If the filesystem resets on each deploy, you lose orders.

A **VPS** gives you both, plainly. Hostinger's managed Node.js hosting may also give you both, but their docs do not state it either way — check the panel for an "Environment variables" section before you rely on it. **Path A below is the one I would use.**

---

# Path A — VPS (recommended)

Buy a VPS and pick the **Ubuntu 24.04 with Node.js** template if offered. Then open **hPanel → VPS → SSH access** and connect.

## 1. Point your domains at the VPS

In your DNS (Hostinger → Domains → DNS zone), create two **A** records pointing at the VPS IP:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | your VPS IP |
| A | `admin` | your VPS IP |

DNS can take up to an hour. Continue while it propagates.

## 2. Install what is missing

```bash
apt update && apt install -y git nginx
node -v
```

If `node -v` prints nothing or below 18:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
```

## 3. Clone the repository

```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/LynnintheLab/digimium_store2.0.git digimium
cd digimium && npm run install:all
```

## 4. Create the two secret files

Generate three different random values:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run it three times. Call them **KEY**, **SECRET** and pick your own passcode.

Store `.env`:

```bash
cat > /var/www/digimium/digimium-store/.env <<'EOF'
PORT=3000
STORE_API_KEY=paste-KEY-here
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_CHAT_ID=
NODE_ENV=production
EOF
```

Admin `.env` — `STORE_API_KEY` must be **the same KEY**, character for character:

```bash
cat > /var/www/digimium/digimium-admin/.env <<'EOF'
PORT=4000
STORE_URL=https://digimium.com
STORE_API_KEY=paste-the-same-KEY-here
SESSION_SECRET=paste-SECRET-here
ADMIN_PASSCODE=choose-a-long-passcode
NODE_ENV=production
EOF
chmod 600 /var/www/digimium/*/.env
```

`STORE_URL` must be the store's **public https address**, not `localhost`. The admin calls it over the network.

## 5. Keep both apps running

```bash
npm install -g pm2
cd /var/www/digimium
pm2 start digimium-store/server.js --name digimium-store
pm2 start digimium-admin/server.js --name digimium-admin
pm2 save && pm2 startup
```

Run the command `pm2 startup` prints. Check both are up:

```bash
pm2 status
curl -s -o /dev/null -w "store %{http_code}\n" http://127.0.0.1:3000/
curl -s -o /dev/null -w "admin %{http_code}\n" http://127.0.0.1:4000/
```

Both should say 200.

## 6. Put Nginx in front

```bash
cat > /etc/nginx/sites-available/digimium <<'EOF'
server {
    listen 80;
    server_name digimium.com www.digimium.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name admin.digimium.com;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/digimium /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

`X-Forwarded-Proto` is not decoration — the admin marks its session cookie `secure` in production and needs it to know the request arrived over https.

## 7. HTTPS

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d digimium.com -d www.digimium.com -d admin.digimium.com
```

Choose redirect when asked. Renewal is automatic.

## 8. Close the direct ports

```bash
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

Without this, `http://your-ip:4000` reaches the admin panel bypassing https.

## 9. First login

Open `https://admin.digimium.com`, enter your passcode, and check the header shows no red banner. A red "Cannot load store data" means `STORE_URL` is wrong or the two keys differ.

## Updating later

```bash
cd /var/www/digimium && git pull && npm run install:all && pm2 restart all
```

`.env` files and `data/` are gitignored, so a pull never overwrites your secrets, products or orders.

---

# Path B — Managed Node.js from Git

Simpler, no server administration, but verify the two requirements above first.

1. **hPanel → Websites → Add Website → Deploy Web App → Import Git Repository.**
2. Authorise GitHub and pick `LynnintheLab/digimium_store2.0`.
3. When asked for the app directory and entry file, give the **store** first:
   - Root / app directory: `digimium-store`
   - Entry file: `server.js`
4. Look for an **Environment variables** section and set `STORE_API_KEY` and `NODE_ENV=production`. **If there is no such section, stop and use Path A** — the alternative is committing secrets to a public repository.
5. Repeat the whole flow a second time for the admin, on a subdomain:
   - Root / app directory: `digimium-admin`
   - Entry file: `server.js`
   - Variables: `STORE_URL` (the store's https URL), the same `STORE_API_KEY`, plus `SESSION_SECRET`, `ADMIN_PASSCODE`, `NODE_ENV=production`

If the panel will only deploy one app per repository, deploy the store from this repo and either move the admin to a VPS or push `digimium-admin/` to its own repository.

**Check persistence before you trade real money through it:** add a product, redeploy, and see whether the product is still there. If it vanishes, `data/` is not persisted and you must move to Path A.

---

# After either path

- Change the passcode from whatever you seeded: **Admin → Account**.
- Fill in **Store info**: Telegram link, channel, both Facebook pages.
- **Set up the Telegram bot.** In the store's `.env`, set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID` (steps in [digimium-store/README.md](digimium-store/README.md)). Checkout puts the order into the customer's Telegram message box, but nothing forces them to press send — the bot is what guarantees you actually receive it.
- Back up `digimium-store/data/` on a schedule. It is your entire catalogue and order history, and it is deliberately not in Git.

## When something is wrong

| Symptom | Cause |
| --- | --- |
| Red banner: cannot load store data | `STORE_URL` wrong, or the two `STORE_API_KEY` values differ |
| Admin loads, every list is empty | Same as above |
| Passcode rejected after a redeploy | `data/admin.json` was wiped, so it reseeded from `ADMIN_PASSCODE` |
| Signed out on every page load | `SESSION_SECRET` not set, so it is regenerated at each restart |
| Products or orders vanished after deploy | `data/` is not on persistent storage |
| Product images 404 | `public/uploads/` is not on persistent storage |
| Store loads but admin writes fail | Store started without `STORE_API_KEY`; its internal API returns 503 |
