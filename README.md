# Order Execution Engine

A high-performance DEX order execution engine with real-time WebSocket updates, intelligent routing between Raydium and Meteora, and concurrent order processing.

## 🎯 Design Decisions

### Why Market Orders?

I chose to implement **Market Orders** because they represent the most fundamental order type in trading systems:

- **Immediate execution**: No complex price monitoring or trigger logic needed
- **Predictable flow**: Clear lifecycle from submission to confirmation
- **Foundation for expansion**: Other order types build upon this base

**Extension Path:**

- **Limit Orders**: Add a price watcher that monitors DEX quotes every N seconds, triggers execution when target price is met
- **Sniper Orders**: Integrate mempool monitoring to detect token launches/migrations, execute immediately upon detection

### Architecture Highlights

**HTTP → WebSocket Upgrade Pattern**

- Single endpoint handles both protocols
- User submits POST, immediately receives WebSocket connection
- No need for separate connection management
- Real-time status updates without polling

**DEX Router Strategy**

- Parallel quote fetching (both DEXs queried simultaneously)
- Best price selection based on net output tokens (accounts for fees)
- Transparent logging of routing decisions
- Mock implementation allows focus on architecture over blockchain complexity

**Queue-Based Processing**

- BullMQ manages up to 10 concurrent orders
- Rate limiting: 100 orders/minute
- Exponential backoff retry (1s → 2s → 4s)
- Graceful failure handling with detailed error logging

## 🏗️ Tech Stack

- **Node.js + TypeScript** - Type-safe backend development
- **Fastify** - High-performance HTTP server with built-in WebSocket support
- **BullMQ + Redis** - Distributed job queue for order processing
- **PostgreSQL** - Persistent order history and state
- **Zod** - Runtime type validation

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd order-execution-engine
npm install
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb order_engine

# Run schema
psql order_engine < database/schema.sql
```

### 3. Environment Configuration

```bash
cp .env.example .env
# Edit .env with your database/redis credentials
```

### 4. Start Services

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

Server runs on `http://localhost:3000`

## 📡 API Usage

### Submit Order (POST → WebSocket)

**Endpoint:** `POST /api/orders/execute`

**Request Body:**

```json
{
  "orderType": "market",
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amountIn": 1.5,
  "slippage": 0.01
}
```

**WebSocket Response Flow:**

```json
// 1. Order received
{
  "orderId": "ORD-1704567890-abc123",
  "status": "pending",
  "timestamp": "2024-01-06T10:30:00Z"
}

// 2. Comparing DEX prices
{
  "orderId": "ORD-1704567890-abc123",
  "status": "routing",
  "timestamp": "2024-01-06T10:30:00.250Z",
  "data": {
    "selectedDex": "meteora",
    "raydiumPrice": 100.23,
    "meteoraPrice": 101.45
  }
}

// 3. Building transaction
{
  "orderId": "ORD-1704567890-abc123",
  "status": "building",
  "timestamp": "2024-01-06T10:30:01Z"
}

// 4. Transaction submitted
{
  "orderId": "ORD-1704567890-abc123",
  "status": "submitted",
  "timestamp": "2024-01-06T10:30:02Z"
}

// 5. Confirmed!
{
  "orderId": "ORD-1704567890-abc123",
  "status": "confirmed",
  "timestamp": "2024-01-06T10:30:05Z",
  "data": {
    "txHash": "5xZmJ3...",
    "executedPrice": 101.45,
    "amountOut": 152.175
  }
}
```

### Check Order Status (REST)

**Endpoint:** `GET /api/orders/:orderId`

```bash
curl http://localhost:3000/api/orders/ORD-1704567890-abc123
```

### List All Orders

**Endpoint:** `GET /api/orders?limit=50&offset=0`

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test -- --coverage

# Watch mode
npm run test:watch
```

**Test Coverage:**

- ✅ DEX router logic (quote fetching, price comparison, execution)
- ✅ Database operations (CRUD, status updates, retry counting)
- ✅ Queue behavior (job creation, retry configuration, concurrency)
- ✅ End-to-end order lifecycle
- ✅ WebSocket lifecycle (connection, updates, disconnection)

## 🎥 Demo Video

[YouTube Demo Link - Coming Soon]

The video demonstrates:

- 5 concurrent order submissions
- WebSocket streaming all status transitions
- DEX routing decisions in server logs
- Queue processing multiple orders simultaneously
- Successful confirmations with transaction hashes

## 📦 Project Structure

```
order-execution-engine/
├── src/
│   ├── types/
│   │   └── index.ts              # Type definitions
│   ├── services/
│   │   ├── mockDexRouter.ts      # DEX price comparison & execution
│   │   ├── database.ts           # PostgreSQL operations
│   │   ├── queueWorker.ts        # BullMQ job processor
│   │   └── __tests__/
│   │       └── mockDexRouter.test.ts
│   ├── __tests__/
│   │   └── integration.test.ts   # End-to-end tests
│   ├── server.ts                 # Fastify server + WebSocket
│   └── index.ts                  # Application entry point
├── database/
│   └── schema.sql                # Database schema
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## 🔍 How It Works

### Order Lifecycle

1. **Submission**: User POSTs order → Server validates → Creates DB record → Returns orderId
2. **Queue**: Order added to BullMQ with retry configuration
3. **Connection Upgrade**: Same HTTP connection becomes WebSocket for live updates
4. **Routing**: Worker queries Raydium + Meteora in parallel → Selects best price
5. **Execution**: Builds transaction → Submits to selected DEX → Waits for confirmation
6. **Completion**: Updates database → Sends final status via WebSocket

### DEX Selection Logic

```typescript
// Both DEXs queried simultaneously
const [raydiumQuote, meteoraQuote] = await Promise.all([
  getRaydiumQuote(tokenIn, tokenOut, amount),
  getMeteorQuote(tokenIn, tokenOut, amount),
]);

// Winner = higher net output (after fees)
selectedDex =
  raydiumQuote.amountOut > meteoraQuote.amountOut ? "raydium" : "meteora";
```

### Retry Strategy

- Max 3 attempts per order
- Exponential backoff: 1s → 2s → 4s
- Failures logged with reason for post-mortem analysis

## 🚢 Deployment

### Railway (Recommended)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### Render

1. Create new Web Service
2. Connect GitHub repo
3. Set environment variables
4. Deploy

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=<your-postgres-url>
REDIS_HOST=<your-redis-host>
REDIS_PORT=6379
REDIS_PASSWORD=<your-redis-password>
```

## 🔗 Public URLs

- **Live API**: Coming soon
- **GitHub Repo**: Coming soon
- **Demo Video**: Coming soon

## 🧩 Postman Collection

Import `postman_collection.json` to test all endpoints:

- Submit market order
- Check order status
- List all orders
- WebSocket connection example

## 📊 Performance Metrics

- **Concurrent orders**: Up to 10 simultaneous
- **Throughput**: 100 orders/minute
- **Average execution time**: 3-4 seconds (routing + execution)
- **Success rate**: ~95% (mock implementation)

## 🛠️ Future Enhancements

- [ ] Real Raydium/Meteora SDK integration
- [ ] Limit order price monitoring
- [ ] Sniper order mempool watching
- [ ] Advanced slippage protection
- [ ] Gas optimization strategies
- [ ] Multi-hop routing for better prices

## 📝 License

MIT

## 👤 Author

Shreya - shreyanand.jpr@gmail.com

---

**Note**: This implementation uses mock DEX responses for development/demonstration. For production use with real funds, integrate actual Raydium and Meteora SDKs and thoroughly test on devnet before mainnet deployment.
