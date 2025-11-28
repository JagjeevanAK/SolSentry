# SolSentry

AI-powered Solana wallet/ Transaction analysis agent with job queue processing.

## Prerequisites

- **Bun** (v1.0 or higher) - [Install Bun](https://bun.sh)
- **Docker** - Required for Redis

## Local Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Start Redis with Docker

```bash
docker-compose up -d
```

This starts Redis on `localhost:6379`. Verify it's running:

```bash
docker ps
```

### 3. Environment Variables

Create a `.env` file in the root directory:

```env
HELIUS_API_KEY=your_helius_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
# For OpenRouter add base URL and change the model name according to OpenRouter
OPENAI_BASE_URL=
PORT=3000
```

### 4. Start the Application

**Development mode with auto-reload:**
```bash
bun run dev
```

**Production mode:**
```bash
bun run server
```

**Start worker (separate terminal):**
```bash
bun run worker
```

## API Routes

### Health Check
- **GET** `/health`
- Returns service status

### Submit Analysis Query
- **POST** `/query`
- **Body:**
  ```json
  {
    "query": "Analyze wallet 3Vj8miZuTSdonf4W1xLdYFatrXLm38CShrCi7NbZS5Ah for last 24 hours",
    "userId": "user123",
    "metadata": {
      "priority": 10,
      "delay": 0
    }
  }
  ```
- **Response:** Job ID and status URL

### Get Job Status
- **GET** `/jobs/:jobId`
- Returns detailed job information

### Get Job Result
- **GET** `/jobs/:jobId/result`
- Returns completed job result or current status

### List Jobs
- **GET** `/jobs?state=active&limit=10`
- **Query params:** `state` (active|completed|failed|delayed), `limit`

### Remove Job
- **DELETE** `/jobs/:jobId`
- Removes a job from the queue

### Queue Statistics
- **GET** `/queues/stats`
- Returns job queue statistics

## Running Queries Without Server

```bash
bun run query "your query here"

# Example
bun run query "are there any abnormalities in 3Vj8miZuTSdonf4W1xLdYFatrXLm38CShrCi7NbZS5Ah for last 24 hours"
```

## Directory Structure

```
src/
├── config/          # API configuration
│   └── api.ts       # Helius and Solscan configs
├── jobs/            # Job queue system
│   ├── index.ts     # Main job exports
│   ├── queue.ts     # BullMQ queue setup
│   ├── redis-config.ts  # Redis connection
│   └── workers.ts   # Job workers
├── tools/           # LangChain tools
│   └── transaction-tools.ts
├── types/           # TypeScript type definitions
│   └── index.ts
├── utils/           # API utilities
│   ├── helius-api.ts    # Helius SDK wrapper
│   └── solscan-api.ts   # Solscan API client
├── workflow/        # LangGraph workflow
│   ├── graph.ts     # Workflow graph definition
│   └── nodes.ts     # Workflow nodes
├── index.ts         # Main exports
└── server.ts        # Express server

examples/
└── custom-query.ts  # CLI query runner
```

## Tech Stack

- **Runtime:** Bun
- **Server:** Express
- **Queue:** BullMQ + Redis
- **AI:** LangChain + OpenAI
- **Blockchain:** Helius SDK, Solscan API

## Troubleshooting

**Redis connection failed:**
- Ensure Docker is running
- Check Redis container: `docker compose ps`
- Restart Redis: `docker compose restart redis`

**Missing API keys:**
- Verify `.env` file exists
- Check environment variables are set correctly
