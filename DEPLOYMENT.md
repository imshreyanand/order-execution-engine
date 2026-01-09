# Deployment Guide

This guide covers deploying your Order Execution Engine to popular free hosting platforms.

## Option 1: Railway (Recommended - Easiest)

Railway provides free PostgreSQL, Redis, and hosting in one place.

### Steps:

1. **Create Railway Account**
   - Go to https://railway.app
   - Sign up with GitHub

2. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

3. **Login and Initialize**
   ```bash
   railway login
   railway init
   ```

4. **Add PostgreSQL**
   ```bash
   railway add --plugin postgresql
   ```

5. **Add Redis**
   ```bash
   railway add --plugin redis
   ```

6. **Set Environment Variables**
   ```bash
   railway variables set NODE_ENV=production
   railway variables set MAX_CONCURRENT_ORDERS=10
   railway variables set ORDERS_PER_MINUTE=100
   railway variables set MAX_RETRY_ATTEMPTS=3
   ```

7. **Deploy**
   ```bash
   railway up
   ```

8. **Get Public URL**
   ```bash
   railway domain
   ```

9. **Run Database Schema**
   ```bash
   # Get database URL
   railway variables get DATABASE_URL
   
   # Connect and run schema
   psql <DATABASE_URL> < database/schema.sql
   ```

### Notes:
- Free tier: 500 hours/month, 512MB RAM
- Automatic HTTPS
- Auto-deploys on git push

---

## Option 2: Render

Render provides free web services, PostgreSQL, and Redis.

### Steps:

1. **Create Render Account**
   - Go to https://render.com
   - Sign up with GitHub

2. **Create PostgreSQL Database**
   - Dashboard → New → PostgreSQL
   - Name: `order-engine-db`
   - Free tier selected
   - Create Database
   - Copy Internal Database URL

3. **Create Redis Instance**
   - Dashboard → New → Redis
   - Name: `order-engine-redis`
   - Free tier selected
   - Create Redis
   - Copy Internal Redis URL

4. **Create Web Service**
   - Dashboard → New → Web Service
   - Connect your GitHub repository
   - Settings:
     - Name: `order-execution-engine`
     - Environment: `Node`
     - Build Command: `npm install && npm run build`
     - Start Command: `npm start`
     - Plan: Free

5. **Set Environment Variables**
   ```
   NODE_ENV=production
   DATABASE_URL=<your-postgres-url>
   REDIS_HOST=<your-redis-hostname>
   REDIS_PORT=6379
   MAX_CONCURRENT_ORDERS=10
   ORDERS_PER_MINUTE=100
   MAX_RETRY_ATTEMPTS=3
   ```

6. **Deploy**
   - Click "Create Web Service"
   - Render will automatically deploy

7. **Run Database Schema**
   - Connect to Shell from Render dashboard
   - Run: `psql $DATABASE_URL < database/schema.sql`

### Notes:
- Free tier: 750 hours/month shared across services
- Spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds

---

## Option 3: Fly.io

Fly.io provides free tier with Docker deployment.

### Steps:

1. **Install Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login**
   ```bash
   fly auth login
   ```

3. **Launch App**
   ```bash
   fly launch
   ```

4. **Add PostgreSQL**
   ```bash
   fly postgres create --name order-engine-db
   fly postgres attach order-engine-db
   ```

5. **Add Redis**
   ```bash
   fly redis create --name order-engine-redis
   ```

6. **Set Secrets**
   ```bash
   fly secrets set NODE_ENV=production
   fly secrets set MAX_CONCURRENT_ORDERS=10
   fly secrets set ORDERS_PER_MINUTE=100
   fly secrets set MAX_RETRY_ATTEMPTS=3
   ```

7. **Deploy**
   ```bash
   fly deploy
   ```

8. **Run Schema**
   ```bash
   fly postgres connect -a order-engine-db
   # Then paste schema.sql contents
   ```

### Notes:
- Free tier: 3 shared-cpu VMs, 3GB persistent volume
- Always-on (no sleeping)
- Great for production-like testing

---

## Post-Deployment Checklist

After deploying to any platform:

### 1. Verify Health Endpoint
```bash
curl https://your-app-url.com/health
```

Should return:
```json
{"status":"ok","timestamp":"..."}
```

### 2. Test Order Submission
```bash
curl -X POST https://your-app-url.com/api/orders/execute \
  -H "Content-Type: application/json" \
  -d '{
    "orderType": "market",
    "tokenIn": "SOL",
    "tokenOut": "USDC",
    "amountIn": 1,
    "slippage": 0.01
  }'
```

### 3. Check Logs
**Railway:**
```bash
railway logs
```

**Render:**
- Dashboard → Your Service → Logs

**Fly.io:**
```bash
fly logs
```

### 4. Monitor Database
```bash
# Railway
railway connect postgresql

# Render
# Use connection string from dashboard

# Fly.io
fly postgres connect -a order-engine-db
```

Then run:
```sql
SELECT COUNT(*) FROM orders;
SELECT status, COUNT(*) FROM orders GROUP BY status;
```

---

## Environment Variables Reference

All platforms need these variables:

```bash
# Required
NODE_ENV=production
DATABASE_URL=postgresql://...
POSTGRES_HOST=...
POSTGRES_PORT=5432
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_DB=order_engine
REDIS_HOST=...
REDIS_PORT=6379

# Optional (with defaults)
PORT=3000
MAX_CONCURRENT_ORDERS=10
ORDERS_PER_MINUTE=100
MAX_RETRY_ATTEMPTS=3
```

---

## Common Issues

### Database Connection Fails

**Problem:** App can't connect to PostgreSQL

**Solution:**
1. Check DATABASE_URL is correct
2. Verify database is in same region/network
3. Check firewall rules allow connections
4. Use internal URLs (not external) when available

### Redis Connection Fails

**Problem:** Queue not processing orders

**Solution:**
1. Verify REDIS_HOST and REDIS_PORT
2. Check Redis is running
3. Test connection: `redis-cli -h <host> -p <port> ping`
4. Use internal Redis URL

### Port Binding Error

**Problem:** "EADDRINUSE" or "Port already in use"

**Solution:**
- Most platforms set PORT environment variable automatically
- Make sure your code uses `process.env.PORT`
- Check our `src/index.ts` already handles this

### WebSocket Not Working

**Problem:** WebSocket connections fail after deployment

**Solution:**
1. Check platform supports WebSocket (all above do)
2. Verify firewall allows WebSocket (upgrade requests)
3. Some platforms require sticky sessions - check docs
4. Use `wss://` (secure WebSocket) for HTTPS sites

### Schema Not Applied

**Problem:** Orders fail with "table does not exist"

**Solution:**
```bash
# Connect to production database
psql <your-database-url>

# Run schema
\i database/schema.sql

# Verify tables exist
\dt
```

---

## Updating Your Deployment

### Railway
```bash
# Automatic on git push
git push origin main

# Or manual
railway up
```

### Render
```bash
# Automatic on git push to connected branch
git push origin main

# Or manual from dashboard
```

### Fly.io
```bash
fly deploy
```

---

## Monitoring and Scaling

### Check Resource Usage

**Railway:**
```bash
railway status
```

**Render:**
- Dashboard → Metrics

**Fly.io:**
```bash
fly status
```

### Scale Up (If Needed)

**Railway:**
- Upgrade to paid plan for more resources

**Render:**
- Dashboard → Settings → Change instance type

**Fly.io:**
```bash
# Scale to 2 instances
fly scale count 2

# Increase memory
fly scale memory 512
```

---

## Backup Strategy

### Database Backups

**Railway:**
- Automatic daily backups on paid plan

**Render:**
```bash
# Manual backup
pg_dump <DATABASE_URL> > backup.sql
```

**Fly.io:**
```bash
fly postgres backup create
fly postgres backup list
```

### Restore from Backup

```bash
# Download backup
# Then restore:
psql <new-database-url> < backup.sql
```

---

## Cost Estimation

### Free Tier Limits

| Platform | Limits | Best For |
|----------|--------|----------|
| Railway | 500 hours/month, 512MB RAM | Development & Testing |
| Render | 750 hours/month, spins down | Demos & Portfolios |
| Fly.io | Always-on, 3 VMs | Production-like Testing |

### When to Upgrade

Upgrade to paid plan when:
- Processing > 1000 orders/day
- Need 24/7 uptime
- Require more than 512MB RAM
- Need dedicated database
- Want better performance

---

## Security Checklist

- [ ] All environment variables set securely
- [ ] Database uses strong password
- [ ] No secrets in source code
- [ ] HTTPS enabled (automatic on all platforms)
- [ ] Redis password set (if available)
- [ ] Regular backups configured
- [ ] Monitoring alerts set up

---

## Next Steps

1. ✅ Deploy to chosen platform
2. ✅ Test all endpoints
3. ✅ Update README with deployment URL
4. ✅ Record demo video showing deployed version
5. ✅ Submit your application!

Good luck! 🚀