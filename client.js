const WebSocket = require("ws");

const COUNT = Number(process.argv[2]) || 100;
const URL = "wss://app-update-rjhf.onrender.com/ws";

let connected = 0;
let closed = 0;
let errors = 0;

const clients = [];

function createClient(i) {
  const deviceId = `test-${String(i).padStart(4, "0")}`;
  const ws = new WebSocket(`${URL}?deviceId=${deviceId}`);

  clients.push(ws);

  ws.on("open", () => {
    connected++;
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

  // 每 5 分鐘模擬 Android heartbeat
  const timer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "heartbeat",
        deviceId,
        ts: Date.now()
      }));
    }
  }, 5 * 60 * 1000);

  ws.on("close", () => clearInterval(timer));
}

// 不要 100 台同一瞬間 handshake
for (let i = 0; i < COUNT; i++) {
  setTimeout(() => createClient(i), i * 20);
}

setInterval(() => {
  const mem = process.memoryUsage();

  console.log(
    `Connected=${connected}/${COUNT} ` +
    `Closed=${closed} Errors=${errors} ` +
    `ClientRSS=${(mem.rss / 1024 / 1024).toFixed(2)}MB`
  );
}, 5000);