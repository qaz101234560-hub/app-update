const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

// WebSocket server 改成 noServer 模式
const wss = new WebSocket.Server({
  noServer: true
});

let totalConnections = 0;
let totalMessages = 0;
let totalClosed = 0;

// 明確處理 HTTP Upgrade
server.on("upgrade", (request, socket, head) => {
  try {
    const url = new URL(request.url, "http://localhost");

    if (url.pathname !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } catch (err) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
  }
});

wss.on("connection", (ws, req) => {
  totalConnections++;

  const url = new URL(req.url, "http://localhost");
  const deviceId = url.searchParams.get("deviceId") || "unknown";

  ws.deviceId = deviceId;
  ws.connectedAt = Date.now();
  ws.lastSeen = Date.now();

  ws.on("message", (data) => {
    totalMessages++;
    ws.lastSeen = Date.now();

    try {
      const message = JSON.parse(data.toString());

      // 目前壓測階段只接收，不回 ACK
      // 避免額外 outbound traffic
      if (message.type === "heartbeat") {
        return;
      }

      if (message.type === "status") {
        return;
      }
    } catch (err) {
      // 壓測時忽略非 JSON 或格式錯誤
    }
  });

  ws.on("close", () => {
    totalClosed++;
  });

  ws.on("error", (err) => {
    console.error(
      `WebSocket error [${deviceId}]: ${err.message}`
    );
  });
});

// 根目錄
app.get("/", (req, res) => {
  res.send("WebSocket test server is running");
});

// 統計資訊
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
  console.log("WebSocket endpoint: /ws");
  console.log("Stats endpoint: /stats");
});