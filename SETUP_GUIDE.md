# Complete Setup Guide

This guide will walk you through setting up the Order Execution Engine from scratch.

## Prerequisites

Make sure you have these installed:

```bash
# Check Node.js version (need 18+)
node --version

# Check npm
npm --version

# Check PostgreSQL (need 14+)
psql --version

# Check Redis (need 6+)
redis-cli --version
```

If you don't have them, install:

- **Node.js**: https://nodejs.org/
- **PostgreSQL**: https://www.postgresql.org/download/
- **Redis**: https://redis.io/download/

## Option 0: Supabase (no local DB install — recommended for quick setup)

If you don't want to install PostgreSQL locally, Supabase provides a free hosted Postgres and an in-browser SQL editor.

Steps:

1. Create a free account at https://app.supabase.com and create a new project (choose a password and database name).
2. Go to **Database → SQL Editor** and open the local file `database/schema.sql`, paste its contents there and run it to create the tables.
3. In **Settings → Database → Connection string**, copy the `postgres://...` connection string and add it to your `.env` as `DATABASE_URL`.
4. Optionally, run the schema applier locally instead of using the SQL editor:

```bash
# Ensure DATABASE_URL is set (supabase connection string)
npm run db:apply
```

> Tip: Using `DATABASE_URL` is convenient for hosted DBs like Supabase — our app will prefer `DATABASE_URL` if present.

---

## Option 1: Quick Start with Docker (Easiest)

If you have Docker installed, this is the fastest way:

```bash
# Start all services
docker-compose up

# That's it! The API will be running on http://localhost:3000
```

## Option 2: Manual Setup (Full Control)

### Step 1: Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd order-execution-engine

# Install dependencies
npm install
```

### Step 2: Start PostgreSQL

**On macOS:**

```bash
# Start PostgreSQL
brew services start postgresql

# Create database
createdb order_engine

# Run schema
psql order_engine < database/schema.sql
```

**On Linux:**

```bash
# Start PostgreSQL
sudo systemctl start postgresql

# Create database
sudo -u postgres createdb order_engine

# Run schema
sudo -u postgres psql order_engine < database/schema.sql
```

**On Windows:**

```bash
# Start PostgreSQL service
net start postgresql-x64-15

# Using pgAdmin or command line
createdb -U postgres order_engine
psql -U postgres order_engine < database/schema.sql
```

### Step 3 (Optional): Start Redis (only for distributed processing)

The application uses an in-memory queue and pubsub by default for local development. If you want to run distributed workers with BullMQ, start Redis and configure `REDIS_HOST` / `REDIS_PORT`.

**On macOS:**

```bash
brew services start redis
```

**On Linux:**

```bash
sudo systemctl start redis
```

**On Windows:**

```bash
# Download Redis for Windows from:
# https://github.com/microsoftarchive/redis/releases

# Start Redis
redis-server
```

### Step 4: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings
nano .env  # or use your favorite editor
```

Your `.env` should look like:

```env
PORT=3000
NODE_ENV=development

# Optional Redis (only required for distributed BullMQ workers)
# REDIS_HOST=localhost
# REDIS_PORT=6379

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=order_engine

MAX_CONCURRENT_ORDERS=10
ORDERS_PER_MINUTE=100
MAX_RETRY_ATTEMPTS=3
```

### Step 5: Run the Application

```bash
# Development mode (auto-restart on changes)
npm run dev

# Or build and run production mode
npm run build
npm start
```

You should see:

```
🚀 Starting Order Execution Engine...
✅ Database connected successfully
✅ Server initialized successfully
🚀 Server running on http://localhost:3000
📡 WebSocket endpoint: ws://localhost:3000/ws?orderId=<order-id>
```

## Testing the Setup

### 1. Health Check

```bash
curl http://localhost:3000/health
```

Should return:

```json
{
  "status": "ok",
  "timestamp": "2024-01-06T10:30:00.000Z"
}
```

### 2. Submit a Test Order

```bash
curl -X POST http://localhost:3000/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "orderType": "market",
    "tokenIn": "SOL",
    "tokenOut": "USDC",
    "amountIn": 1.5,
    "slippage": 0.01
  }'
```

### 3. Check Order Status

```bash
# Replace ORDER_ID with the orderId from previous response
curl http://localhost:3000/api/orders/ORDER_ID
```

### 4. List All Orders

```bash
curl http://localhost:3000/api/orders
```

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm test -- --coverage

# Watch mode (re-runs on file changes)
npm run test:watch
```

## Testing with Postman

1. **Import Collection**: Open Postman → Import → Select `postman_collection.json`
2. **Set Base URL**: Check that `{{base_url}}` variable is set to `http://localhost:3000`
3. **Run Tests**: Try each endpoint in order:
   - Health Check
   - Submit Market Order
   - Get Order Status
   - List All Orders

## Testing WebSocket (Using wscat)

Install wscat:

```bash
npm install -g wscat
```

Connect and submit order:

```bash
# This won't work directly because WebSocket needs HTTP upgrade

Note: The server supports upgrading the initial POST `/api/orders/execute` connection to a WebSocket. You can send the POST with `Upgrade: websocket` headers and include the JSON body — the server will accept the upgrade and stream order status on the same connection.
# Use Postman or write a small Node.js script

# Example Node.js script:
node test-websocket.js
```

Create `test-websocket.js`:

```javascript
const WebSocket = require("ws");

const ws = new WebSocket("ws://localhost:3000/api/orders/execute");

ws.on("open", () => {
  console.log("Connected to WebSocket");

  // Send order (this would normally be POST data)
  const order = {
    orderType: "market",
    tokenIn: "SOL",
    tokenOut: "USDC",
    amountIn: 1,
    slippage: 0.01,
  };

  console.log("Submitting order:", order);
});

ws.on("message", (data) => {
  console.log("Received:", JSON.parse(data.toString()));
});

ws.on("error", (error) => {
  console.error("Error:", error);
});
```

## Troubleshooting

### PostgreSQL Connection Issues

**Error: "ECONNREFUSED"**

```bash
# Check if PostgreSQL is running
pg_isready

# Start PostgreSQL
brew services start postgresql  # macOS
sudo systemctl start postgresql # Linux
```

**Error: "database does not exist"**

```bash
# Create the database
createdb order_engine

# Run schema
psql order_engine < database/schema.sql
```

### Redis Connection Issues

**Error: "ECONNREFUSED 127.0.0.1:6379"**

```bash
# Check if Redis is running
redis-cli ping

# Should return: PONG

# If not running, start it
brew services start redis  # macOS
sudo systemctl start redis # Linux
```

### Port Already in Use

**Error: "EADDRINUSE"**

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or change PORT in .env
PORT=3001
```

### TypeScript Build Errors

```bash
# Clear build cache
rm -rf dist/
rm -rf node_modules/

# Reinstall
npm install

# Rebuild
npm run build
```

## Monitoring Logs

### View All Logs

```bash
# Development mode shows everything
npm run dev

# Production mode
npm start
```

### Key Log Messages

**Successful order flow:**

```
📝 [ORD-xxx] Order created: 1.5 SOL → USDC
🔄 [ORD-xxx] Routing: Comparing Raydium vs Meteora...
📊 [ORD-xxx] Routing Decision: meteora selected
🔨 [ORD-xxx] Building transaction for meteora...
📤 [ORD-xxx] Submitting transaction to meteora...
✅ [ORD-xxx] Transaction confirmed: 5xZmJ3...
```

**Failed order with retry:**

```
❌ [ORD-xxx] Attempt 1 failed: Slippage tolerance exceeded
🔄 [ORD-xxx] Will retry in 2s (attempt 2/3)
```

## Database Queries (Debugging)

Connect to PostgreSQL:

```bash
psql order_engine
```

Useful queries:

```sql
-- See all orders
SELECT order_id, status, token_in, token_out, created_at
FROM orders
ORDER BY created_at DESC
LIMIT 10;

-- Count by status
SELECT status, COUNT(*)
FROM orders
GROUP BY status;

-- Find failed orders
SELECT order_id, error_message, retry_count
FROM orders
WHERE status = 'failed';

-- Recent confirmed orders
SELECT order_id, selected_dex, executed_price, tx_hash
FROM orders
WHERE status = 'confirmed'
ORDER BY confirmed_at DESC
LIMIT 5;
```

## Performance Testing

### Concurrent Orders Test

Use this script to test concurrent processing:

```bash
# Create test-concurrent.sh
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/orders/execute \
    -H "Content-Type: application/json" \
    -d "{
      \"orderType\": \"market\",
      \"tokenIn\": \"SOL\",
      \"tokenOut\": \"USDC\",
      \"amountIn\": $i,
      \"slippage\": 0.01
    }" &
done
wait
```

Run it:

```bash
chmod +x test-concurrent.sh
./test-concurrent.sh
```

Watch server logs to see all 10 orders processing simultaneously!

## Next Steps

1. ✅ Verify all tests pass: `npm test`
2. ✅ Test with Postman collection
3. ✅ Submit 5 concurrent orders
4. ✅ Record demo video
5. ✅ Deploy to hosting platform
6. ✅ Update README with deployment URL

## Need Help?

- Check logs for error messages
- Verify all services are running
- Ensure ports are not blocked
- Check environment variables are correct

Good luck! 🚀
