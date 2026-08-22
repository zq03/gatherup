/*
 * GatherUp sync server
 * -------------------------------------------------------------
 * A tiny WebSocket server that stores each "jio" (plan) and syncs it
 * live between everyone who has the link. Runs on your VPS.
 *
 *   node server.js              # listens on port 8787 by default
 *   PORT=9000 node server.js    # custom port
 *   DATA_DIR=/var/gatherup node server.js   # where the JSON files live
 *
 * The front-end (hosted on GitHub Pages) connects here over WebSocket.
 * No database needed — each room is a small JSON file on disk.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8787;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---- starting states ------------------------------------------------ */
function emptyState() {
  return {
    event: { name: "New Jio 🎉" },
    members: [],
    avail: {},
    where: [],
    what: [],
    bill: { total: "0.00", payer: "", mode: "even", present: {}, items: [] },
  };
}
// A pre-filled example so the `#demo` room looks alive.
function demoState() {
  return {
    event: { name: "Weekend Jio 🎉" },
    members: [
      { id: "ziq", name: "Ziqiang", color: "#F0563E" },
      { id: "wei", name: "Wei", color: "#3D74F0" },
      { id: "sara", name: "Sara", color: "#12A46E" },
      { id: "dik", name: "Diksha", color: "#E1900B" },
      { id: "marc", name: "Marcus", color: "#8A5CF0" },
      { id: "aish", name: "Aishah", color: "#E0559A" },
      { id: "jun", name: "Jun", color: "#2AB0C4" },
    ],
    avail: {
      ziq: { "Sat 30|3pm": true, "Sat 30|6:30pm": true, "Fri 29|6:30pm": true },
      wei: { "Fri 29|12pm": true, "Fri 29|3pm": true, "Fri 29|6:30pm": true, "Sat 30|3pm": true, "Sat 30|6:30pm": true, "Sun 31|6:30pm": true },
      sara: { "Fri 29|6:30pm": true, "Fri 29|9pm": true, "Sat 30|6:30pm": true, "Sat 30|9pm": true },
      dik: { "Sat 30|12pm": true, "Sat 30|3pm": true, "Sat 30|6:30pm": true, "Sun 31|12pm": true, "Sun 31|3pm": true, "Sun 31|6:30pm": true },
      marc: { "Sat 30|3pm": true, "Sat 30|6:30pm": true, "Sat 30|9pm": true, "Sun 31|3pm": true, "Sun 31|6:30pm": true, "Sun 31|9pm": true },
      aish: { "Fri 29|6:30pm": true, "Sat 30|12pm": true, "Sat 30|3pm": true, "Sat 30|6:30pm": true },
      jun: { "Fri 29|3pm": true, "Fri 29|6:30pm": true, "Fri 29|9pm": true, "Sat 30|6:30pm": true, "Sat 30|9pm": true },
    },
    where: [
      { id: "w1", emoji: "🚇", name: "Bugis", meta: "Central line, food everywhere", votes: ["wei", "sara", "dik", "marc", "jun"] },
      { id: "w2", emoji: "🛍️", name: "Orchard", meta: "Malls + restaurants", votes: ["aish", "marc"] },
      { id: "w3", emoji: "🏙️", name: "City Hall", meta: "Between everyone", votes: ["sara", "jun"] },
    ],
    what: [
      { id: "f1", emoji: "🍲", name: "Beauty in the Pot", meta: "Hotpot · $$ · books groups", votes: ["wei", "sara", "dik", "aish", "jun"] },
      { id: "f2", emoji: "🍜", name: "A-One Claypot", meta: "Zi char · $ · casual", votes: ["marc", "wei"] },
      { id: "f3", emoji: "🍕", name: "PizzaExpress", meta: "Western · $$ · big tables", votes: ["dik"] },
    ],
    bill: {
      total: "286.50", payer: "ziq", mode: "even",
      present: { ziq: true, wei: true, sara: true, dik: true, marc: true, aish: true, jun: true },
      items: [
        { name: "Hotpot (broth + meats + sides)", amt: "206.50", who: ["ziq", "wei", "sara", "dik", "marc", "aish", "jun"] },
        { name: "Beer tower ×2", amt: "48.00", who: ["wei", "marc", "jun"] },
        { name: "Fresh juices ×2", amt: "32.00", who: ["sara", "aish", "dik"] },
      ],
    },
  };
}

/* ---- room store ----------------------------------------------------- */
const rooms = new Map(); // id -> { state, rev, clients:Set, saveTimer }

function safeId(id) {
  return String(id || "demo").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "demo";
}
function roomFile(id) {
  return path.join(DATA_DIR, safeId(id) + ".json");
}
function loadRoom(id) {
  id = safeId(id);
  if (rooms.has(id)) return rooms.get(id);
  let state;
  try {
    state = JSON.parse(fs.readFileSync(roomFile(id), "utf8"));
  } catch (e) {
    state = id === "demo" ? demoState() : emptyState();
  }
  const r = { state, rev: 0, clients: new Set(), saveTimer: null };
  rooms.set(id, r);
  return r;
}
function persist(id) {
  const r = rooms.get(id);
  if (!r) return;
  clearTimeout(r.saveTimer);
  r.saveTimer = setTimeout(() => {
    fs.writeFile(roomFile(id), JSON.stringify(r.state), (err) => {
      if (err) console.error("save failed for", id, err.message);
    });
  }, 700);
}
function broadcast(roomId, payload, except) {
  const r = rooms.get(roomId);
  if (!r) return;
  const msg = JSON.stringify(payload);
  r.clients.forEach((c) => {
    if (c !== except && c.readyState === 1) c.send(msg);
  });
}

/* ---- http (health only; the page itself is on GitHub Pages) --------- */
const server = http.createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200); res.end("ok"); return; }
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("GatherUp sync server is running. The app is served from GitHub Pages.");
});

/* ---- websocket ------------------------------------------------------ */
const wss = new WebSocketServer({ server, maxPayload: 512 * 1024 });

wss.on("connection", (ws) => {
  ws.roomId = null;
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch (e) { return; }

    if (msg.type === "join") {
      const id = safeId(msg.room);
      ws.roomId = id;
      const r = loadRoom(id);
      r.clients.add(ws);
      ws.send(JSON.stringify({ type: "state", state: r.state, rev: r.rev }));
      broadcast(id, { type: "peers", n: r.clients.size });
    } else if (msg.type === "update" && ws.roomId) {
      const r = loadRoom(ws.roomId);
      if (msg.state && typeof msg.state === "object") {
        r.state = msg.state;
        r.rev++;
        persist(ws.roomId);
        broadcast(ws.roomId, { type: "state", state: r.state, rev: r.rev }, ws);
      }
    }
  });

  ws.on("close", () => {
    const r = ws.roomId && rooms.get(ws.roomId);
    if (r) { r.clients.delete(ws); broadcast(ws.roomId, { type: "peers", n: r.clients.size }); }
  });
});

// drop dead connections
const ping = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  });
}, 30000);
wss.on("close", () => clearInterval(ping));

server.listen(PORT, () => {
  console.log("GatherUp sync server listening on port " + PORT);
  console.log("Data dir: " + DATA_DIR);
});
