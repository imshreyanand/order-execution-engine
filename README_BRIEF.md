# Order Execution Engine — Quick Start

A minimal, local-friendly DEX order execution engine that accepts order submissions and streams real-time status updates via WebSocket.

## What it does ✅

- Accepts orders (market orders implemented) and returns an `orderId` immediately.
- Processes orders via an in-memory queue and routes to a mock DEX router.
- Streams order lifecycle updates over the same HTTP connection upgraded to WebSocket, or via a separate WebSocket subscription.

## Quick usage 🔧

- Submit an order (HTTP POST):

```bash
curl -X POST http://localhost:3000/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{"orderType":"market","tokenIn":"SOL","tokenOut":"USDC","amountIn":1.5,"slippage":0.01}'
```

- Same-connection WebSocket upgrade: include `Connection: Upgrade` and `Upgrade: websocket` headers when POSTing and read initial messages on the upgraded socket (the server will validate, enqueue, and immediately send a `pending` update).

- Separate subscription (after you have `orderId`):

```bash
# WebSocket subscription to receive updates
# ws://localhost:3000/ws?orderId=<order-id>
```

## Notes & limitations ⚠️

- Currently **market orders** are implemented and validated. Limit/sniper orders are documented in code and README as extension paths but not fully supported.
- The DEX router and execution are mocked for demo/testing — do not use with real funds.

## Run locally 🧪

1. Install deps: `npm install`
2. Start server: `npm run dev` (server listens on `http://localhost:3000`)
3. Run tests: `npm test`

## Where to look 🔍

- Core server and WebSocket handling: `src/server.ts`
- Order types: `src/types/index.ts`
- Queue worker and execution logic: `src/services/queueWorker.ts` and `src/services/mockDexRouter.ts`

---

If you want, I can replace the main `README.md` with this concise version or tweak wording/tone. Let me know which you prefer.
