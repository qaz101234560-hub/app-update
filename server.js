const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({
  noServer: true
});

// ==============================
// 基本統計
// ==============================

let totalConnections = 0;
let totalMessages = 0;
let totalClosed = 0;

// ==============================
// Outbound 統計
// ==============================

let totalOutboundBytes = 0;
let totalOutboundMessages = 0;

// Render 每月 5 GB
const MONTHLY_OUTBOUND_LIMIT_BYTES =
  5 * 1024 * 1024 * 1024;

// ==============================
// Messages/sec
// ==============================

let lastTotalMessages = 0;
let messagesPerSecond = 0;

// ==============================
// CPU
// ==============================

let lastCpuUsage = process.cpuUsage();
let lastCpuCheckNs = process.hrtime.bigint();

let cpuPercent = 0;

// ==============================
// 每秒更新 CPU / message rate
// ==============================

setInterval(() => {
  // ------------------------------
  // Messages/sec
  // ------------------------------

  const currentMessages = totalMessages;

  messagesPerSecond =
    currentMessages - lastTotalMessages;

  lastTotalMessages =
    currentMessages;

  // ------------------------------
  // CPU
  // ------------------------------

  const nowCpuUsage =
    process.cpuUsage();

  const nowNs =
    process.hrtime.bigint();

  const userDiffUs =
    nowCpuUsage.user -
    lastCpuUsage.user;

  const systemDiffUs =
    nowCpuUsage.system -
    lastCpuUsage.system;

  const cpuUsedUs =
    userDiffUs +
    systemDiffUs;

  const elapsedUs =
    Number(
      nowNs - lastCpuCheckNs
    ) / 1000;

  cpuPercent =
    elapsedUs > 0
      ? (cpuUsedUs / elapsedUs) * 100
      : 0;

  lastCpuUsage =
    nowCpuUsage;

  lastCpuCheckNs =
    nowNs;

}, 1000);

// ==============================
// 統一 Server -> Client 發送函式
// ==============================

function sendToClient(ws, data) {

  if (
    ws.readyState !==
    WebSocket.OPEN
  ) {
    return false;
  }

  const payload =
    typeof data === "string"
      ? data
      : JSON.stringify(data);

  const bytes =
    Buffer.byteLength(
      payload,
      "utf8"
    );

  totalOutboundBytes += bytes;
  totalOutboundMessages++;

  ws.send(payload);

  return true;
}

// ==============================
// WebSocket Upgrade
// ==============================

server.on(
  "upgrade",
  (request, socket, head) => {

    try {

      const url =
        new URL(
          request.url,
          "http://localhost"
        );

      if (
        url.pathname !== "/ws"
      ) {

        socket.write(
          "HTTP/1.1 404 Not Found\r\n\r\n"
        );

        socket.destroy();

        return;
      }

      wss.handleUpgrade(
        request,
        socket,
        head,
        (ws) => {

          wss.emit(
            "connection",
            ws,
            request
          );

        }
      );

    } catch (err) {

      socket.write(
        "HTTP/1.1 400 Bad Request\r\n\r\n"
      );

      socket.destroy();

    }

  }
);

// ==============================
// WebSocket Connection
// ==============================

wss.on(
  "connection",
  (ws, req) => {

    totalConnections++;

    const url =
      new URL(
        req.url,
        "http://localhost"
      );

    const deviceId =
      url.searchParams.get(
        "deviceId"
      ) || "unknown";

    ws.deviceId =
      deviceId;

    ws.connectedAt =
      Date.now();

    ws.lastSeen =
      Date.now();

    // ------------------------------
    // Client -> Server message
    // ------------------------------

    ws.on(
      "message",
      (data) => {

        totalMessages++;

        ws.lastSeen =
          Date.now();

        try {

          const message =
            JSON.parse(
              data.toString()
            );

          if (
            message.type ===
            "heartbeat"
          ) {

            return;
          }

          if (
            message.type ===
            "status"
          ) {

            return;
          }

        } catch (err) {

          // 壓測期間忽略格式錯誤

        }

      }
    );

    // ------------------------------
    // Close
    // ------------------------------

    ws.on(
      "close",
      () => {

        totalClosed++;

      }
    );

    // ------------------------------
    // Error
    // ------------------------------

    ws.on(
      "error",
      (err) => {

        console.error(
          `WebSocket error [${deviceId}]: ${err.message}`
        );

      }
    );

  }
);

// ==============================
// Server -> Client 測試
//
// 每 30 秒向所有在線裝置
// 發送 heartbeat_ack
// ==============================

setInterval(() => {

  const message = {
    type: "heartbeat_ack",
    timestamp: Date.now()
  };

  let sentCount = 0;

  wss.clients.forEach(
    (ws) => {

      if (
        sendToClient(
          ws,
          message
        )
      ) {

        sentCount++;

      }

    }
  );

  console.log(
    `Heartbeat ACK sent to ${sentCount} clients`
  );

}, 30000);

// ==============================
// HTTP Root
// ==============================

app.get(
  "/",
  (req, res) => {

    res.send(
      "WebSocket test server is running"
    );

  }
);

// ==============================
// Stats
// ==============================

app.get(
  "/stats",
  (req, res) => {

    const mem =
      process.memoryUsage();

    const outboundKB =
      totalOutboundBytes /
      1024;

    const outboundMB =
      totalOutboundBytes /
      1024 /
      1024;

    const outboundGB =
      totalOutboundBytes /
      1024 /
      1024 /
      1024;

    const percentOf5GB =
      (
        totalOutboundBytes /
        MONTHLY_OUTBOUND_LIMIT_BYTES
      ) * 100;

    res.json({

      connected:
        wss.clients.size,

      totalConnections,

      totalClosed,

      totalMessages,

      messagesPerSecond,

      memory: {

        rssMB:
          +(
            mem.rss /
            1024 /
            1024
          ).toFixed(2),

        heapUsedMB:
          +(
            mem.heapUsed /
            1024 /
            1024
          ).toFixed(2),

        heapTotalMB:
          +(
            mem.heapTotal /
            1024 /
            1024
          ).toFixed(2),

        externalMB:
          +(
            mem.external /
            1024 /
            1024
          ).toFixed(2)

      },

      cpu: {

        processPercent:
          +cpuPercent.toFixed(2)

      },

      outbound: {

        messages:
          totalOutboundMessages,

        bytes:
          totalOutboundBytes,

        kb:
          +outboundKB.toFixed(2),

        mb:
          +outboundMB.toFixed(4),

        gb:
          +outboundGB.toFixed(6),

        percentOf5GB:
          +percentOf5GB.toFixed(6)

      },

      uptimeSeconds:
        Math.floor(
          process.uptime()
        )

    });

  }
);

// ==============================
// Start Server
// ==============================

const PORT =
  process.env.PORT || 3000;

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Server listening on port ${PORT}`
    );

    console.log(
      "WebSocket endpoint: /ws"
    );

    console.log(
      "Stats endpoint: /stats"
    );

    console.log(
      "Heartbeat ACK interval: 30 seconds"
    );

  }
);