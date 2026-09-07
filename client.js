const WebSocket = require("ws");

const COUNT = Number(process.argv[2]) || 500;
const URL = "wss://app-update-rjhf.onrender.com/ws";

let connected = 0;
let closed = 0;
let errors = 0;
let sent = 0;

const clients = [];

function hex(n) {
  return (n & 0xff).toString(16).padStart(2, "0").toUpperCase();
}

function buildStatus(i, deviceId) {
  return {
    type: "status",
    deviceId,
    sn: `SN-${String(i).padStart(8, "0")}`,
    wifiMac: `02:10:00:00:${hex(i >> 8)}:${hex(i)}`,
    btMac: `02:20:00:00:${hex(i >> 8)}:${hex(i)}`,
    ethernetMac: `02:30:00:00:${hex(i >> 8)}:${hex(i)}`,
    swVersion: "1.0.10",
    project: "yokai",
    timestamp: Date.now()
  };
}

function createClient(i) {
  const deviceId = `test-${String(i).padStart(4, "0")}`;
  const ws = new WebSocket(`${URL}?deviceId=${deviceId}`);

  clients.push(ws);

  ws.on("open", () => {
    connected++;

    // 一連線成功先送一次完整狀態
    ws.send(JSON.stringify(buildStatus(i, deviceId)));
    sent++;
  });

  ws.on("close", (code, reason) => {
    connected--;
    closed++;

    console.log(
      `[CLOSE] ${deviceId} code=${code} reason=${reason.toString()}`
    );
  });

  ws.on("error", (err) => {
    errors++;

    console.log(
      `[ERROR] ${deviceId}: ${err.message}`
    );
  });

  ws.on("unexpected-response", (req, res) => {
    console.log(
      `[HTTP ERROR] ${deviceId}: HTTP ${res.statusCode}`
    );
  });

  // 壓測：每 5 秒送一次完整 device status
  const timer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(buildStatus(i, deviceId)));
      sent++;
    }
  }, 5000);

  ws.on("close", () => {
    clearInterval(timer);
  });
}

// 每 20ms 建一條，避免瞬間一起 handshake
for (let i = 0; i < COUNT; i++) {
  setTimeout(() => {
    createClient(i);
  }, i * 20);
}

setInterval(() => {
  const mem = process.memoryUsage();

  console.log(
    `Connected=${connected}/${COUNT} ` +
    `Closed=${closed} ` +
    `Errors=${errors} ` +
    `Sent=${sent} ` +
    `ClientRSS=${(mem.rss / 1024 / 1024).toFixed(2)}MB`
  );
}, 5000);