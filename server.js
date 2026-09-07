const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({
  server,
  path: "/ws"
});

let totalConnections = 0;
let totalMessages = 0;
let totalClosed = 0;

wss.on("connection", (ws, req) => {
  totalConnections++;

  const url = new URL(req.url, "http://localhost");
  const deviceId = url.searchParams.get("deviceId") || "unknown";

  ws.deviceId = deviceId;

  ws.on("message", (data) => {
    totalMessages++;

    // 壓測時不回 ACK，避免製造不必要 outbound traffic
  });

  ws.on("close", () => {
    totalClosed++;
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error [${deviceId}]:`, err.message);
  });
});

app.get("/", (req, res) => {
  res.send("WebSocket test server is running");
});

app.get("/stats", (req, res) => {
  const mem = process.memoryUsage();

  res.json({
    connected: wss.clients.size,
    totalConnections,
    totalClosed,
    totalMessages,

    memory: {
      rssMB: +(mem.rss / 1024 / 1024).toFixed(2),
      heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: +(mem.heapTotal / 1024 / 1024).toFixed(2),
      externalMB: +(mem.external / 1024 / 1024).toFixed(2)
    },

    uptimeSeconds: Math.floor(process.uptime())
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`WebSocket endpoint: /ws`);
  console.log(`Stats endpoint: /stats`);
});