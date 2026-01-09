# Deployment Guide

## Docker Deployment

### Build Docker Image

```bash
docker build -t order-execution-engine:latest .
```

### Run Container

```bash
docker run -d \
  --name order-execution-engine \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DB_HOST=<db-host> \
  -e DB_PASSWORD=<db-password> \
  order-execution-engine:latest
```

### Docker Compose Deployment

```bash
docker-compose up -d
```

## Environment Variables

Set the following environment variables before deployment:

- `NODE_ENV`: Set to `production`
- `PORT`: Port to run the server on (default: 3000)
- `DB_HOST`: Database host
- `DB_PORT`: Database port
- `DB_USER`: Database user
- `DB_PASSWORD`: Database password
- `DB_NAME`: Database name
- `RPC_URL`: Blockchain RPC endpoint
- `PRIVATE_KEY`: Private key for transactions
- `ROUTER_ADDRESS`: DEX router contract address

## Health Checks

Monitor application health:

```bash
curl http://localhost:3000/health
```

## Logs

View application logs:

```bash
docker logs order-execution-engine
```

## Scaling

For production, consider:

- Load balancing with multiple instances
- Queue optimization
- Database connection pooling
- Caching layer (Redis)
