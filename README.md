# GatherUp 🎉

One link that takes a group of friends from *"let's jio"* to *"everyone's paid"* —
agree on **when**, **where**, and **what to eat**, then **split the receipt**.
No accounts, no app to install: the organiser shares a link, everyone taps to join.

Built for Singapore (PayNow-style settle-up), but works anywhere.

---

## How it's put together

Two halves that you host in two places:

```
┌─────────────────────────┐        WebSocket        ┌──────────────────────────┐
│   The page (front-end)  │  ───────────────────▶   │   The server (back-end)  │
│   index.html            │  ◀───────────────────   │   server/server.js       │
│   hosted on GitHub Pages│      live vote sync      │   runs on YOUR VPS       │
│   (free, public)        │                          │   stores the data        │
└─────────────────────────┘                          └──────────────────────────┘
```

- **The page** is a single static `index.html`. GitHub Pages serves it to anyone
  who opens the link. It holds no secrets.
- **The server** is a tiny Node program on your VPS. It stores each jio as a
  small JSON file and pushes every change out to everyone viewing that link, live.

Each shared link is its own jio — the room id is the bit after `#`, e.g.
`https://you.github.io/gatherup/#a7k2p9`.

```
gatherup/
├── index.html          ← the app (deploy to GitHub Pages)
├── .nojekyll           ← tells GitHub Pages to serve files as-is
├── README.md
└── server/
    ├── server.js       ← the sync server (deploy to your VPS)
    ├── package.json
    └── README.md
```

---

## Part A — Put the page on GitHub Pages

> GitHub Pages' free tier needs a **public** repo. The page code is safe to be
> public — it contains no secrets; your data lives on your VPS. If you'd rather
> keep the repo private, host the page on **Cloudflare Pages** or **Netlify**
> instead (both free, both work with private repos) — the steps are otherwise
> the same.

1. Create a new GitHub repo (e.g. `gatherup`) and push this folder:

   ```bash
   cd gatherup
   git init
   git add .
   git commit -m "GatherUp"
   git branch -M main
   git remote add origin https://github.com/<your-username>/gatherup.git
   git push -u origin main
   ```

2. On GitHub: **Settings → Pages → Build and deployment**. Set **Source** to
   *Deploy from a branch*, branch `main`, folder `/ (root)`. Save.

3. After a minute your site is live at
   `https://<your-username>.github.io/gatherup/`.

At this point the page works in **offline preview mode** (changes stay on each
device). Do Part B and C to make it truly live.

---

## Part B — Run the sync server on your VPS

You need Node.js 18+ on the VPS.

```bash
# copy the server/ folder to your VPS, then:
cd server
npm install
node server.js            # test run — listens on port 8787
```

Visit `http://your-vps-ip:8787/health` — it should say `ok`.

**Keep it running with pm2** (restarts on crash and on reboot):

```bash
npm install -g pm2
pm2 start server.js --name gatherup
pm2 save
pm2 startup        # run the command it prints, once
```

### Give it HTTPS (required)

Because GitHub Pages is served over **https**, the browser will only let the page
open a **secure** WebSocket (`wss://`). So the server needs a domain with TLS.
The easiest way is **[Caddy](https://caddyserver.com/)**, which gets a free
certificate automatically. Point a subdomain (e.g. `gather.yourdomain.com`) at
your VPS, then:

```
# /etc/caddy/Caddyfile
gather.yourdomain.com {
    reverse_proxy localhost:8787
}
```

```bash
sudo systemctl reload caddy
```

Caddy passes WebSocket traffic through automatically. Now
`wss://gather.yourdomain.com` reaches your server securely.

<details>
<summary>Prefer nginx? (click)</summary>

```nginx
server {
    server_name gather.yourdomain.com;
    location / {
        proxy_pass http://localhost:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    # add TLS with:  sudo certbot --nginx -d gather.yourdomain.com
}
```
</details>

---

## Part C — Connect the page to your server

Open `index.html`, find this line near the top of `<body>`:

```html
<script>
  window.GATHERUP_BACKEND = ""; // <-- put your VPS websocket URL here
</script>
```

Set it to your server's secure address:

```html
  window.GATHERUP_BACKEND = "wss://gather.yourdomain.com";
```

Commit and push. GitHub Pages redeploys in a minute, and the site is now **live**:
open it, click **＋** to start a new jio, and share the link. Everyone who opens
it picks their name and votes together in real time.

> Tip: open `https://<your-username>.github.io/gatherup/#demo` to see a
> pre-filled example group.

---

## Using it

1. Open the site → a fresh jio link is created (or click **＋** for a new one).
2. Enter your name when asked.
3. **Share the link** (⇪ button) with your friends.
4. Everyone fills in **When** they're free, votes **Where** and **What**, and at
   the end **scans the receipt** and splits it — each person gets their share.

## Good to know / limits

- **Data** is stored as plain JSON files in `server/data/` on your VPS. Back up
  that folder to keep history. Delete a file to reset that jio.
- **Simultaneous edits:** if two people tap in the exact same instant, the last
  one wins (the whole plan is saved as one blob). Fine for a normal group; if you
  later need heavy concurrency, move to per-field updates or a real database.
- **Receipt scan** currently loads a sample receipt. To make it read real photos,
  add an OCR step on the server (e.g. call a vision API) and send back the line
  items — the front-end already handles an itemised list.
- **Rooms never expire** here. Add a cleanup job if you host it long-term.

Made with GatherUp · a friends-hangout planner.
