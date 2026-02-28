const { Queue, QueueEvents } = require("bullmq");
const logger = require("../config/logger");
const { createRedisClient, createBullMQConnection } = require("../db/redis");
const config = require("../config");


const queueConnection = createBullMQConnection();

const eventsConnection = createRedisClient("bullmq-events");

const eventQueue = new Queue(config.queue.mainQueueName, {
  connection: queueConnection,
  defaultJobOptions: {
    
    
    attempts: config.queue.maxRetries,
    backoff: {
      type: "exponential",
      delay: config.queue.backoffDelay,
    },
    
    removeOnComplete: {
      age: config.queue.keepCompletedFor / 1000,
      count: 1000, 
    },
    
    removeOnFail: {
      age: config.queue.keepFailedFor / 1000,
      count: 5000,
    },
  },
});


const dlqQueue = new Queue(config.queue.dlqName, {
  connection: createRedisClient("bullmq-dlq"),
  defaultJobOptions: {
    
    attempts: 1,
    removeOnComplete: false, 
    removeOnFail: false,
  },
});

const queueEvents = new QueueEvents(config.queue.mainQueueName, {
  connection: eventsConnection,
});

queueEvents.on("completed", ({ jobId }) => {
  logger.debug("[Queue] Job completed", { jobId });
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  logger.warn("[Queue] Job failed", { jobId, reason: failedReason });
});

queueEvents.on("stalled", ({ jobId }) => {
  
  
  logger.warn("[Queue] Job stalled — will be requeued", { jobId });
});




/**
 * Adds an event to the main processing queue.
 *
 * @param {Object} eventPayload - The validated event body from the HTTP request
 * @param {string} eventId - The idempotency key (courier-provided or generated)
 * @returns {Promise<Job>} The created BullMQ job
 */
async function enqueueEvent(eventPayload, eventId) {
  
  
  
  
  
  if (process.env.LOCAL_NO_QUEUE === "1") {
    logger.debug("[Queue] LOCAL_NO_QUEUE active, skipping Redis enqueue");
    return { id: `stub-${eventId}` };
  }

  const job = await eventQueue.add(
    
    eventPayload.eventType || "unknown",
    {
      eventId,
      eventType: eventPayload.eventType,
      trackingNumber: eventPayload.trackingNumber,
      payload: eventPayload,
      enqueuedAt: new Date().toISOString(),
    },
    {
      
      
      jobId: `event-${eventId}`,
    }
  );

  logger.info("[Queue] Event enqueued", {
    jobId: job.id,
    eventId,
    eventType: eventPayload.eventType,
    trackingNumber: eventPayload.trackingNumber,
  });

  return job;
}

/**
 * Moves a failed job to the DLQ for manual inspection.
 * Called by the worker after all retries are exhausted.
 *
 * @param {Object} jobData - Original job data
 * @param {string} lastError - The error message from the last attempt
 * @param {number} totalAttempts - How many attempts were made
 */
async function moveToDLQ(jobData, lastError, totalAttempts) {
  await dlqQueue.add("dlq-event", {
    ...jobData,
    lastError,
    totalAttempts,
    movedToDLQAt: new Date().toISOString(),
  });

  logger.error("[Queue] Job moved to DLQ", {
    eventId: jobData.eventId,
    lastError,
    totalAttempts,
  });
}

/**
 * Returns current queue metrics — useful for health checks and dashboards.
 */
async function getQueueMetrics() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    eventQueue.getWaitingCount(),
    eventQueue.getActiveCount(),
    eventQueue.getCompletedCount(),
    eventQueue.getFailedCount(),
    eventQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}
async function warmupQueue() {
  const job = await eventQueue.add("warmup", { warmup: true }, { jobId: "warmup-probe" });
  try { await job.remove(); } catch(e) {  }
}
module.exports = { eventQueue, dlqQueue, warmupQueue,enqueueEvent, moveToDLQ, getQueueMetrics };
