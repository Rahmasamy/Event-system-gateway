"use strict";

const logger = require("../../logs/logger");
const { ProcessedEvent } = require("../../models/ProcessEvents");
const { Shipment } = require("../../models/Shipment");














/**
 * Fetches a shipment by tracking number.
 * Returns null (not throws) if the shipment doesn't exist.
 * The worker decides what to do with a missing shipment.
 *
 * @param {string} trackingNumber
 * @returns {Promise<Object|null>}
 */
async function getShipmentByTrackingNumber(trackingNumber) {
  if (!trackingNumber) return null;

  const shipment = await Shipment.findOne({ trackingNumber })
    .lean() 
    .exec();

  if (!shipment) {
    logger.debug("[ShipmentService] Shipment not found", { trackingNumber });
    return null;
  }

  logger.debug("[ShipmentService] Shipment found", {
    trackingNumber,
    status: shipment.status,
    merchantId: shipment.merchantId,
  });

  return shipment;
}

/**
 * Updates a shipment's status and routing result after an event is processed.
 *
 * @param {string} trackingNumber
 * @param {string} newStatus - New shipment status
 * @param {Object} routingResult - Routing decision from the routing service
 * @returns {Promise<Object>} Updated shipment
 */
async function updateShipmentAfterEvent(trackingNumber, newStatus, routingResult) {
  const updated = await Shipment.findOneAndUpdate(
    { trackingNumber },
    {
      $set: {
        status: newStatus,
        routingResult,
        lastEventAt: new Date(),
      },
    },
    {
      new: true, 
      lean: true,
      
      upsert: false,
    }
  );

  if (!updated) {
    logger.warn("[ShipmentService] Could not update shipment — not found", {
      trackingNumber,
    });
    return null;
  }

  logger.info("[ShipmentService] Shipment updated", {
    trackingNumber,
    newStatus,
    route: routingResult?.assignedRoute,
  });

  return updated;
}

/**
 * Determines the new shipment status based on the incoming event type.
 * Centralizes the event-type → status mapping.
 *
 * @param {string} eventType
 * @param {string} currentStatus
 * @returns {string} New status
 */
function resolveNewStatus(eventType, currentStatus) {
  const statusMap = {
    shipment_created: "active",
    pickup_scheduled: "active",
    picked_up: "in_transit",
    in_transit: "in_transit",
    out_for_delivery: "in_transit",
    delivered: "delivered",
    delivery_exception: "exception",
    cancelled: "cancelled",
    returned: "exception",
  };

  const newStatus = statusMap[eventType];

  if (!newStatus) {
    logger.debug("[ShipmentService] Unknown event type, keeping current status", {
      eventType,
      currentStatus,
    });
    return currentStatus;
  }

  
  if (currentStatus === "delivered" && newStatus !== "delivered") {
    logger.warn("[ShipmentService] Ignoring status regression attempt", {
      eventType,
      currentStatus,
      attemptedStatus: newStatus,
    });
    return currentStatus;
  }

  return newStatus;
}

/**
 * Checks if an event has already been processed (DB-level idempotency).
 * This is the SECOND layer of idempotency (Redis is the first).
 *
 * @param {string} eventId
 * @returns {Promise<boolean>}
 */
async function isEventAlreadyProcessed(eventId) {
  const existing = await ProcessedEvent.exists({ eventId });
  return !!existing;
}

/**
 * Records a successfully processed event in the audit log.
 * Uses insertOne directly to avoid Mongoose overhead on high-volume writes.
 *
 * @param {Object} eventRecord
 */
async function recordProcessedEvent(eventRecord) {
  
  
  try {
    await ProcessedEvent.create(eventRecord);
    logger.debug("[ShipmentService] Processed event recorded", {
      eventId: eventRecord.eventId,
    });
  } catch (err) {
    if (err.code === 11000) {
      
      
      logger.debug("[ShipmentService] Event already recorded in DB (race condition caught)", {
        eventId: eventRecord.eventId,
      });
      return;
    }
    throw err; 
  }
}

module.exports = {
  getShipmentByTrackingNumber,
  updateShipmentAfterEvent,
  resolveNewStatus,
  isEventAlreadyProcessed,
  recordProcessedEvent,
};