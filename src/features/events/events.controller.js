"use strict";


const logger = require("../../config/logger");
const {
  enqueueEvent,
  getQueueMetrics,
  getDLQSummary,
  reprocessDLQEvent,
} = require("./events.service");


function validateEventPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Payload must be a JSON object";
  }
  if (!payload.eventType || typeof payload.eventType !== "string") {
    return "Missing required field: eventType (string)";
  }
  if (!payload.trackingNumber || typeof payload.trackingNumber !== "string") {
    return "Missing required field: trackingNumber (string)";
  }
  if (payload.eventType.length > 100) {
    return "eventType exceeds maximum length of 100 characters";
  }
  return null;
}

async function postEvent(req, res) {
  const requestStart = Date.now();

  try {
    const payload = req.body;

    const validationError = validateEventPayload(payload);
    if (validationError) {
      return res.status(400).json({
        error: "Bad Request",
        message: validationError,
      });
    }

    const eventId = req.eventId || `gen:${require("crypto").randomUUID()}`;

    
    enqueueEvent(payload, eventId)
      .then((job) => {
        logger.info("[Events] Event successfully enqueued", {
          eventId,
          jobId: job.id,
          eventType: payload.eventType,
          trackingNumber: payload.trackingNumber,
        });
      })
      .catch((err) => {
        logger.error("[Events] Enqueue failed", {
          error: err.message,
          eventId,
          eventType: payload.eventType,
        });
      });

    const responseTime = Date.now() - requestStart;

    return res.status(202).json({
      status: "accepted",
      message: "Event queued for processing",
      eventId,
      processingNote: "Event will be processed asynchronously",
    });
  } catch (err) {
    logger.error("[Events] Failed to enqueue event", {
      error: err.message,
      body: req.body,
    });

    return res.status(503).json({
      error: "Service Unavailable",
      message: "Unable to accept event at this time. Please retry.",
    });
  }
}

async function getHealth(req, res) {
  try {
    const metrics = await getQueueMetrics();
    return res.status(200).json({
      status: "ok",
      queue: metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(503).json({ status: "degraded", error: err.message });
  }
}

async function getDLQ(req, res) {
  try {
    const summary = await getDLQSummary();
    return res.status(200).json({ status: "ok", dlq: summary });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function postDLQReprocess(req, res) {
  try {
    const { eventId } = req.params;
    const result = await reprocessDLQEvent(eventId);
    return res.status(202).json({
      status: "accepted",
      message: "DLQ event re-enqueued",
      ...result,
    });
  } catch (err) {
    logger.error("[Events] DLQ reprocess failed", { error: err.message });
    return res.status(404).json({ error: err.message });
  }
}

module.exports = {
  postEvent,
  getHealth,
  getDLQ,
  postDLQReprocess,
};
