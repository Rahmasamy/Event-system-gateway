const { default: IORedis } = require("ioredis");
const config = require("../config");
const logger = require("../logs/logger");

function createRedisClient(name = "default") {
  const client = new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    retryStrategy: (times) => {
      const delay = Math.min(times * 500, 30000);
      logger.warn(
        `[Redis:${name}] Reconnecting... attempt ${times}, delay ${delay}ms`,
      );
      return delay;
    },
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });

  client.on("connect", () => logger.info(`[Redis:${name}] Connected`));
  client.on("ready", () => logger.info(`[Redis:${name}] Ready`));
  client.on("error", (err) =>
    logger.error(`[Redis:${name}] Error`, { error: err.message }),
  );
  client.on("close", () => logger.warn(`[Redis:${name}] Connection closed`));
  client.on("reconnecting", () =>
    logger.warn(`[Redis:${name}] Reconnecting...`),
  );

  return client;
}
function createBullMQConnection() {
  return new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
    
    enableAutoPipelining: true,
    
    commandTimeout: 5000,
    retryStrategy: (times) => Math.min(times * 500, 30000),
  });
}

let defaultClient = null;

function getRedisClient() {
  if (!defaultClient) {
    defaultClient = createRedisClient("main");
  }
  return defaultClient;
}

async function closeRedisClient() {
  if (defaultClient) {
    await defaultClient.quit();
    defaultClient = null;
    logger.info("[Redis:main] Connection closed gracefully");
  }
}

module.exports = { createRedisClient, getRedisClient, createBullMQConnection, closeRedisClient };
