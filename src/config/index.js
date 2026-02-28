"use strict";

const { get, getInt } = require("../lib/helpers");
const config = {
    env : get("NODE_ENV", "development",false),
    isProduction : process.env.NODE_ENV === "production",
    server : {
        port : getInt("PORT",3000)
    },
    security : {
         hmacSecret: get("HMAC_SECRET"),
    },
    redis: {
    host: get("REDIS_HOST", "localhost", false),
    port: getInt("REDIS_PORT", 6379),
    password: get("REDIS_PASSWORD", "", false),
    
    retryStrategy: (times) => Math.min(times * 500, 30000),
  },

  mongo: {
    uri: get("MONGO_URI"),
    options: {
      
      maxPoolSize: 20,
      minPoolSize: 5,
      
      serverSelectionTimeoutMS: 5000,
      
      socketTimeoutMS: 45000,
    },
  },

  queue: {
    
    mainQueueName: "events-main",
    
    dlqName: "events-dlq",
    
    
    concurrency: getInt("WORKER_CONCURRENCY", 10),
    
    maxRetries: getInt("JOB_MAX_RETRIES", 3),
    
    
    backoffDelay: getInt("JOB_BACKOFF_DELAY", 2000),
    
    keepCompletedFor: 3600 * 1000,
    
    keepFailedFor: 86400 * 1000,
  },

  idempotency: {
    
    keyPrefix: "idem:",
    
    ttl: getInt("IDEMPOTENCY_TTL", 86400),
  },

  routingService: {
    url: get("ROUTING_SERVICE_URL", "http://localhost:3000"),
    timeout: getInt("ROUTING_SERVICE_TIMEOUT", 5000),
    
    simulatedDelay: 2000,
  },
};



module.exports = config;