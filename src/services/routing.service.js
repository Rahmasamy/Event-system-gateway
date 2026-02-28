const config = require("../config");
const logger = require("../logs/logger");

/**
 * Custom error class for routing service failures.
 * Allows the worker to distinguish routing failures from other errors.
 */
class RoutingServiceError extends Error {
  constructor(message, { retryable = true, statusCode = null } = {}) {
    super(message);
    this.name = "RoutingServiceError";
    
    this.retryable = retryable;
    this.statusCode = statusCode;
  }
}

/**
 * Simulates a high-latency external routing service call.
 * Mimics real behavior:
 *   - ~2 second response time
 *   - Occasional random failures (5% chance) to test retry logic
 *   - Timeout protection
 *
 * @param {Object} shipment - Shipment data from MongoDB
 * @param {Object} eventPayload - The original event payload
 * @returns {Promise<Object>} Routing decision result
 */
async function callRoutingService(shipment, eventPayload) {
  const startTime = Date.now();

  logger.debug("[RoutingService] Calling routing service", {
    trackingNumber: shipment?.trackingNumber,
    eventType: eventPayload.eventType,
  });

  
  
  
  const result = await Promise.race([
    performRoutingCall(shipment, eventPayload),
    createTimeout(config.routingService.timeout),
  ]);

  const duration = Date.now() - startTime;
  logger.debug("[RoutingService] Response received", {
    duration,
    route: result.assignedRoute,
  });

  return result;
}

/**
 * The actual (simulated) routing call.
 * In production, this would be: fetch(config.routingService.url, { ... })
 */
async function performRoutingCall(shipment, eventPayload) {
  
  
  const jitter = Math.floor(Math.random() * 400) - 200;
  await sleep(config.routingService.simulatedDelay + jitter);

  
  
  if (Math.random() < 0.05) {
    throw new RoutingServiceError("Routing service temporarily unavailable (simulated)", {
      retryable: true,
      statusCode: 503,
    });
  }

  
  if (!shipment) {
    throw new RoutingServiceError("Shipment not found in routing system", {
      retryable: false, 
      statusCode: 404,
    });
  }

  
  const routingResult = {
    assignedRoute: determineRoute(shipment, eventPayload),
    carrier: shipment.carrier || "auto-selected",
    estimatedDelivery: calculateEstimatedDelivery(shipment),
    priority: determinePriority(eventPayload),
    routedAt: new Date().toISOString(),
  };

  return routingResult;
}

/**
 * Timeout promise — rejects after the specified ms.
 */
function createTimeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new RoutingServiceError(`Routing service timed out after ${ms}ms`, {
          retryable: true,
        })
      );
    }, ms);
  });
}



function determineRoute(shipment, eventPayload) {
  const { eventType } = eventPayload;
  const { status, destination } = shipment;

  
  if (eventType === "delivery_exception") return "EXCEPTION_HANDLING_LANE";
  if (eventType === "out_for_delivery") return "LAST_MILE_LANE";
  if (status === "in_transit") return "TRANSIT_MONITORING_LANE";
  return "STANDARD_PROCESSING_LANE";
}

function calculateEstimatedDelivery(shipment) {
  const now = new Date();
  const days = shipment.carrier === "express" ? 1 : 3;
  now.setDate(now.getDate() + days);
  return now.toISOString().split("T")[0];
}

function determinePriority(eventPayload) {
  const highPriorityEvents = ["delivery_exception", "damaged", "lost"];
  return highPriorityEvents.includes(eventPayload.eventType) ? "HIGH" : "NORMAL";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { callRoutingService, RoutingServiceError };