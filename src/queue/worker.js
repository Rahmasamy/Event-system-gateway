require("dotenv").config();

const config = require("../config");
const logger = require("../config/logger");
const { Worker } = require("bullmq");
const { createRedisClient, createBullMQConnection } = require("../db/redis");
const { connectMongo } = require("../db/mongo");
const { moveToDLQ } = require("./queue");
const { processEvent } = require("../features/event-processor/event-processor.service");

let isShuttingDown = false;


async function startWorker() {
  
  await connectMongo();
  logger.info("[Worker] MongoDB connected");

  const workerConnection = createBullMQConnection();

  const worker = new Worker(
    config.queue.mainQueueName,
    
    async (job) => {
      if (isShuttingDown) {
        
        throw new Error("Worker is shutting down");
      }

      const { eventId, eventType, trackingNumber, payload } = job.data;

      logger.info("[Worker] Processing job", {
        jobId: job.id,
        eventId,
        eventType,
        trackingNumber,
        attempt: job.attemptsMade + 1,
        maxAttempts: config.queue.maxRetries,
      });

      
      const result = await processEvent({
        jobId: job.id,
        eventId,
        eventType,
        trackingNumber,
        payload,
        attemptsMade: job.attemptsMade + 1,
      });

      logger.info("[Worker] Job processed successfully", {
        jobId: job.id,
        eventId,
        routingResult: result.routingResult,
      });

      return result;
    },
    {
      connection: workerConnection,

      
      
      
      
      concurrency: config.queue.concurrency,

      
      
      
      
      lockDuration: 30000,
      lockRenewTime: 15000,
    },
  );

  

  worker.on("completed", (job, result) => {
    logger.info("[Worker] ✓ Job completed", {
      jobId: job.id,
      eventId: job.data.eventId,
      duration: Date.now() - job.timestamp,
    });
  });

  worker.on("failed", async (job, err) => {
    const isLastAttempt = job.attemptsMade >= config.queue.maxRetries;

    logger.error("[Worker] ✗ Job failed", {
      jobId: job.id,
      eventId: job.data?.eventId,
      attempt: job.attemptsMade,
      isLastAttempt,
      error: err.message,
    });

    
    if (isLastAttempt) {
      await moveToDLQ(job.data, err.message, job.attemptsMade);
    }
  });

  worker.on("error", (err) => {
    logger.error("[Worker] Worker-level error", { error: err.message });
  });

  worker.on("stalled", (jobId) => {
    logger.warn("[Worker] Job stalled — BullMQ will requeue it", { jobId });
  });

  logger.info("[Worker] Started", {
    queue: config.queue.mainQueueName,
    concurrency: config.queue.concurrency,
  });

  return worker;
}



async function shutdown(worker) {
  logger.info("[Worker] Shutdown signal received — draining active jobs...");
  isShuttingDown = true;

  
  
  await worker.close(true);
  logger.info("[Worker] All active jobs finished. Exiting.");
  process.exit(0);
}


startWorker()
  .then((worker) => {
    process.on("SIGTERM", () => shutdown(worker));
    process.on("SIGINT", () => shutdown(worker));

    
    process.on("unhandledRejection", (reason) => {
      logger.error("[Worker] Unhandled rejection", { reason: String(reason) });
    });
  })
  .catch((err) => {
    logger.error("[Worker] Failed to start", { error: err.message });
    process.exit(1);
  });
