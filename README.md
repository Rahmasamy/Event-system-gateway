# Fincart Resilient Event Orchestration Gateway

A high-concurrency, asynchronous event gateway built with Node.js, Express, BullMQ, Redis, and MongoDB. Designed to absorb massive traffic bursts while guaranteeing event delivery, idempotency, and resilience.

---

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env

# 2. Spin up everything with one command
docker compose up --build

# 3. Run the 100-request load test (in a separate terminal)
node scripts/load-test.js


```

---

## Architecture Overview

```
External Couriers (DHL, FedEx, etc.)
         │
         │  POST /api/events
         │  X-Fincart-Signature: sha256=<hmac>
         ▼
┌─────────────────────────────────────┐
│     INGESTION LAYER (Express)       │  ← Responds in < 150ms
│                                     │
│  1. HMAC-SHA256 Signature Check     │
│  2. Redis Idempotency Guard         │
│  3. Enqueue to BullMQ               │
│  4. Return 202 Accepted             │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│             REDIS                   │
│                                     │
│  • BullMQ Main Queue (persistent)   │
│  • BullMQ DLQ                       │
│  • Idempotency key store (24h TTL)  │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│     WORKER LAYER (BullMQ Worker)    │  ← Scales independently
│     concurrency: 10                 │
│                                     │
│  1. DB Idempotency double-check     │
│  2. Fetch shipment from MongoDB     │
│  3. Call Routing Service (~2s)      │
│  4. Update shipment status          │
│  5. Write processed event audit log │
│                                     │
│  On failure: exponential backoff    │
│  After max retries: → DLQ           │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│           MONGODB                   │
│                                     │
│  Collections:                       │
│  • shipments                        │
│  • processedevents (audit + idem)   │
│  • dlqevents (failed job store)     │
└─────────────────────────────────────┘
```

---

## Key Design Decisions

### Why the worker runs as a separate process
The Express app and BullMQ worker are separate Docker services. This means:
- The ingestion layer can be scaled independently of processing capacity
- A worker crash doesn't take down the HTTP server
- In production, you'd run 1 app instance + N worker instances behind a queue

### Why 202 Accepted instead of 200 OK
`202 Accepted` semantically means "I received this and will process it asynchronously." Using `200 OK` would imply the work is done, which is false. This is important for callers who need to know whether to poll for results.

---

## Dead Letter Queue (DLQ) Strategy

### What triggers the DLQ
A job moves to the DLQ after exhausting all retry attempts (default: 3 attempts with exponential backoff). This happens when:
- The Routing Service is consistently unavailable (infrastructure failure)
- A non-retryable error occurs (e.g., corrupt payload, permanently missing shipment)
- The worker crashes mid-job and the job stalls (BullMQ detects and requeues, but if this repeats, it eventually exhausts retries)

### What happens in the DLQ
1. **BullMQ DLQ queue** holds the raw job data in Redis
2. **DLQ Worker** (`src/queue/dlq.js`) picks it up and persists it to the `dlqevents` MongoDB collection
3. **Ops team** monitors the collection: `db.dlqevents.find({ resolved: false })`
4. **Alerting** (production): Trigger PagerDuty/Slack when `unresolved` count exceeds a threshold

### Manual Reprocessing
After the root cause is fixed (e.g., Routing Service recovered):

```bash
# Reprocess a specific DLQ event
POST /api/events/dlq/reprocess/:eventId
```

This re-enqueues the event with a fresh idempotency key so the Redis/DB guards don't block it as a duplicate.

### Why not auto-retry from DLQ?
Auto-retry from DLQ can create feedback loops. If 10,000 events failed due to a 2-hour Routing Service outage, auto-retrying all of them simultaneously would create the exact burst problem we're trying to solve. Manual or rate-limited reprocessing is safer.

---

## Eventual Consistency Strategy

The system intentionally embraces eventual consistency in several places:

### 1. Ingestion → Processing gap
The 202 response tells the caller "we have it" but the shipment status in MongoDB won't reflect the event until the worker processes it (typically < 5 seconds under normal load). Callers who need confirmation should poll the shipment status endpoint or subscribe to webhooks.

### 2. Idempotency key propagation
Redis idempotency keys are set atomically (SET NX), but there's a brief window between the Redis key being set and the event being written to MongoDB's `processedevents` collection. If the app crashes in this window:
- Redis key exists → duplicate will be blocked
- MongoDB record doesn't exist → worker won't find it as "already processed"

This is a false duplicate block (the event won't be reprocessed). This is acceptable because the alternative (processing a duplicate) is worse.

### 3. Worker idempotency double-check
The worker always checks MongoDB before processing, even if Redis already blocked duplicates. This handles the case where Redis was flushed or restarted between the ingestion and processing phases.

### 4. Shipment status regression guard
The `resolveNewStatus()` function prevents a "delivered" shipment from being rolled back to "in_transit" by a late-arriving event. Events can arrive out-of-order in distributed logistics systems.

---

## API Reference

### POST /api/events
Ingests an event.

**Headers:**
```
Content-Type: application/json
X-Fincart-Signature: sha256=<hmac-sha256-of-body>
```

**Body:**
```json
{
  "eventId": "unique-event-id",
  "eventType": "in_transit",
  "trackingNumber": "TRK-ABC123",
  "carrier": "fedex",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Response 202:**
```json
{
  "status": "accepted",
  "eventId": "unique-event-id",
  "jobId": "event:unique-event-id"
}
```

### GET /api/events/health
Returns queue depth metrics.

### GET /api/events/dlq
Returns DLQ summary and recent failures.

### POST /api/events/dlq/reprocess/:eventId
Re-enqueues a DLQ event for manual reprocessing.

---

## Retry Strategy

| Attempt | Delay | Total wait |
|---------|-------|------------|
| 1       | 0s    | 0s         |
| 2       | 2s    | 2s         |
| 3       | 4s    | 6s         |
| → DLQ   | —     | —          |

Formula: `delay = baseDelay * 2^(attempt-1)`
Base delay is configurable via `JOB_BACKOFF_DELAY` (default: 2000ms).

---

## Scaling

```bash
# Scale to 3 worker instances (30 concurrent jobs total)
docker compose up --scale worker=3

# The ingestion layer is stateless — scale it too
docker compose up --scale app=2
```

The queue acts as the backpressure mechanism — workers pull at their own pace regardless of ingestion burst size.