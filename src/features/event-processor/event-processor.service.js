"use strict";

const {
  getShipmentByTrackingNumber,
  updateShipmentAfterEvent,
  resolveNewStatus,
  isEventAlreadyProcessed,
  recordProcessedEvent,
} = require("../shippment/shipment.service");
const { callRoutingService, RoutingServiceError } = require("../../services/routing.service");
const logger = require("../../logs/logger");






















/**
 * Processes a single event through the full pipeline.
 *
 * @param {Object} params
 * @param {string} params.jobId
 * @param {string} params.eventId
 * @param {string} params.eventType
 * @param {string} params.trackingNumber
 * @param {Object} params.payload
 * @param {number} params.attemptsMade
 * @returns {Promise<Object>} Processing result
 */
async function processEvent({ jobId, eventId, eventType, trackingNumber, payload, attemptsMade }) {
  const startTime = Date.now();

  
  
  
  const alreadyProcessed = await isEventAlreadyProcessed(eventId);
  if (alreadyProcessed) {
    logger.info("[Processor] Event already processed (DB-level idempotency catch)", {
      eventId,
      jobId,
    });
    
    return { eventId, status: "skipped:duplicate", message: "Already processed" };
  }

  
  
  
  const shipment = await getShipmentByTrackingNumber(trackingNumber);

  if (!shipment) {
    logger.warn("[Processor] Shipment not found for event", {
      eventId,
      trackingNumber,
      eventType,
    });
    
    
    
    if (attemptsMade >= 2) {
      
      const err = new Error(`Shipment not found after ${attemptsMade} attempts: ${trackingNumber}`);
      err.retryable = false; 
      throw err;
    }
    
    throw new Error(`Shipment not found (may be replication lag): ${trackingNumber}`);
  }

  
  let routingResult;
  try {
    routingResult = await callRoutingService(shipment, payload);
  } catch (err) {
    if (err instanceof RoutingServiceError && !err.retryable) {
      
      logger.error("[Processor] Non-retryable routing error", {
        eventId,
        error: err.message,
      });
      err.retryable = false;
      throw err;
    }
    
    logger.warn("[Processor] Retryable routing error", {
      eventId,
      error: err.message,
      attempt: attemptsMade,
    });
    throw err;
  }

  
  const newStatus = resolveNewStatus(eventType, shipment.status);
  await updateShipmentAfterEvent(trackingNumber, newStatus, routingResult);

  
  await recordProcessedEvent({
    eventId,
    eventType,
    trackingNumber,
    payload,
    routingResult,
    processedAt: new Date(),
    attemptsMade,
  });

  const duration = Date.now() - startTime;

  logger.info("[Processor] Event fully processed", {
    eventId,
    eventType,
    trackingNumber,
    newStatus,
    route: routingResult.assignedRoute,
    duration,
    attemptsMade,
  });

  return {
    eventId,
    status: "processed",
    newStatus,
    routingResult,
    duration,
  };
}

module.exports = { processEvent };