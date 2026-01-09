// WebSocket test script
const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:3000");

ws.on("open", () => {
  console.log("Connected to WebSocket");

  // Send test message
  ws.send(
    JSON.stringify({
      type: "subscribe",
      channel: "orders",
    })
  );
});

ws.on("message", (data) => {
  console.log("Received:", data);
});

ws.on("error", (error) => {
  console.error("WebSocket error:", error);
});

ws.on("close", () => {
  console.log("Disconnected from WebSocket");
});

// Keep connection open
process.stdin.resume();
