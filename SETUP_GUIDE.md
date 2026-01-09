# Setup Guide

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- MySQL 8.0
- Docker (optional)

## Installation

1. Clone the repository

```bash
git clone <repository-url>
cd order-execution-engine
```

2. Install dependencies

```bash
npm install
```

3. Setup environment variables

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Setup database

```bash
mysql -u root -p < database/schema.sql
```

## Development

Start the development server:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## Production Build

Build the project:

```bash
npm run build
```

Start production server:

```bash
npm start
```

## Docker Setup

Build and run with Docker:

```bash
npm run docker:build
npm run docker:run
```

Or simply:

```bash
docker-compose up
```
