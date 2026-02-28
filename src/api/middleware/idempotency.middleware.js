const config = require("../../config");
const logger = require("../../config/logger");
const { getRedisClient } = require("../../db/redis");

function extractEventId(req) {
  return (
    req.body?.eventId ||
    req.body?.id ||
    req.headers["x-event-id"] ||
    null
  );
}

async function idempotencyCheck(req, res, next) {
  const eventId = extractEventId(req);

  
  
  if (!eventId) {
    logger.debug("[Idempotency] No event ID found, skipping check");
    return next();
  }

  const redisKey = `${config.idempotency.keyPrefix}${eventId}`;
  const redis = getRedisClient();

  
  
  
  redis.set(redisKey, "1", "NX", "EX", config.idempotency.ttl)
    .then(result => {
      if (result === null) {
        
        
        logger.info("[Idempotency] Duplicate event detected (async check)", {
          eventId,
        });
      }
    })
    .catch(err => {
      
      
      logger.error("[Idempotency] Redis check failed (async)", {
        error: err.message,
        eventId,
      });
    });

  
  req.eventId = eventId;
  logger.debug("[Idempotency] Request proceeding (async dedup in background)", { eventId });
  next();
}

module.exports = { idempotencyCheck };
