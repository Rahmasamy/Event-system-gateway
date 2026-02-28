const { Worker } = require("bullmq");
const { createRedisClient } = require("../db/redis");
const { enqueueEvent } = require("./queue");
const logger = require("../config/logger");
const config = require("../config");
const { DLQEvent } = require("../models/DLQ");


function startDLQWorker() {
  const dlqWorkerConnection = createRedisClient("bullmq-dlq-worker");

  const dlqWorker = new Worker(
    config.queue.dlqName,
    async (job) => {
      const { eventId, eventType, payload, lastError, totalAttempts, movedToDLQAt } = job.data;

      logger.error("[DLQ] Processing DLQ event", {
        jobId: job.id,
        eventId,
        eventType,
        lastError,
        totalAttempts,
      });

      
      
      await DLQEvent.findOneAndUpdate(
        { eventId },
        {
          $setOnInsert: {
            eventId,
            jobId: job.id,
            eventType,
            payload,
            lastError,
            totalAttempts,
            failedAt: movedToDLQAt ? new Date(movedToDLQAt) : new Date(),
          },
        },
        { upsert: true, new: true }
      );

      logger.warn("[DLQ] Event persisted to MongoDB DLQ collection", {
        eventId,
        eventType,
        totalAttempts,
      });

      
      
    },
    {
      connection: dlqWorkerConnection,
      
      concurrency: 2,
    }
  );

  dlqWorker.on("completed", (job) => {
    logger.info("[DLQ] Event logged successfully", { jobId: job.id });
  });

  dlqWorker.on("failed", (job, err) => {
    
    logger.error("[DLQ] CRITICAL: DLQ processor failed", {
      jobId: job?.id,
      error: err.message,
    });
  });

  return dlqWorker;
}

/**
 * Re-enqueues a DLQ event for reprocessing.
 * Called by the admin API after ops have resolved the root cause.
 *
 * @param {string} eventId - The eventId of the DLQ event to reprocess
 * @returns {Promise<Object>} The new job info
 */
async function reprocessDLQEvent(eventId) {
  
  const dlqRecord = await DLQEvent.findOne({ eventId, resolved: false });

  if (!dlqRecord) {
    throw new Error(`DLQ event not found or already resolved: ${eventId}`);
  }

  
  
  
  const reprocessEventId = `${eventId}:reprocess:${Date.now()}`;

  const job = await enqueueEvent(dlqRecord.payload, reprocessEventId);

  
  await DLQEvent.findOneAndUpdate(
    { eventId },
    {
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy: "system:reprocess",
    }
  );

  logger.info("[DLQ] Event re-enqueued for reprocessing", {
    originalEventId: eventId,
    reprocessEventId,
    newJobId: job.id,
  });

  return { jobId: job.id, reprocessEventId };
}

/**
 * Returns a summary of pending DLQ events.
 * Used by the /health/dlq endpoint.
 */
async function getDLQSummary() {
  const [total, unresolved] = await Promise.all([
    DLQEvent.countDocuments(),
    DLQEvent.countDocuments({ resolved: false }),
  ]);

  const recentErrors = await DLQEvent.find({ resolved: false })
    .sort({ failedAt: -1 })
    .limit(10)
    .select("eventId eventType lastError failedAt totalAttempts")
    .lean();

  return { total, unresolved, recentErrors };
}

module.exports = { startDLQWorker, reprocessDLQEvent, getDLQSummary };