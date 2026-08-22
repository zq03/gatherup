# GatherUp sync server

The little Node server that stores each jio and syncs it live between everyone
on the link. Full deploy instructions are in the [root README](../README.md).

## Quick start (on your VPS)

```bash
cd server
npm install
node server.js          # listens on port 8787
```

Environment variables:

| Variable   | Default          | Meaning                                  |
|------------|------------------|------------------------------------------|
| `PORT`     | `8787`           | Port the server listens on               |
| `DATA_DIR` | `./data`         | Folder where each room's JSON file lives |

Each jio is stored as one JSON file in `DATA_DIR` (e.g. `data/abc123.json`),
so backing up = copying that folder. The special room `demo` is pre-filled
with the sample "Weekend Jio" so `yoursite/#demo` looks alive.

The server only speaks WebSocket (plus a `/health` check). The actual web page
is served separately from GitHub Pages.
