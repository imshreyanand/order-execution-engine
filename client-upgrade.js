// client-upgrade.js
const http = require("http");

const order = JSON.stringify({
  orderType: "market",
  tokenIn: "SOL",
  tokenOut: "USDC",
  amountIn: 1.5,
  slippage: 0.01,
});

const options = {
  hostname: "localhost",
  port: 3000,
  path: "/api/orders/execute",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Connection: "Upgrade",
    Upgrade: "websocket",
    "Sec-WebSocket-Version": "13",
    "Sec-WebSocket-Key": Buffer.from(Math.random().toString()).toString(
      "base64"
    ),
  },
};

const req = http.request(options);

req.on("upgrade", (res, socket) => {
  console.log("Upgraded — listening for messages...");
  socket.on("data", (chunk) => console.log("MSG:", chunk.toString()));
  socket.on("end", () => console.log("Socket ended"));
  socket.on("error", (err) => console.error("Socket error", err));
});

req.on("error", (err) => console.error("Request error", err));

// send body in chunked mode
req.write(order);
req.end();
