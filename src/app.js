"use strict";



















require("dotenv").config();

const express = require("express");
const crypto = require("crypto");

const { connectMongo, closeMongo } = require("./db/mongo");
const { getRedisClient, closeRedisClient } = require("./db/redis");
const eventsRouter = require("./features/events/events.route");
const config = require("./config");
const logger = require("./config/logger");
const { warmupQueue } = require("./queue/queue");

const app = express();




/**
 * Capture raw body buffer for HMAC validation.
 * The HMAC is computed over the raw bytes. If we parse first, we lose the
 * original byte sequence (JSON.stringify ≠ original string due to key ordering).
 */
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf; 
    },
    limit: "1mb", 
  }),
);


app.use((req, res, next) => {
  
  res.removeHeader("X-Powered-By");
  
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});


app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const level =
      res.statusCode >= 500
        ? "error"
        : res.statusCode >= 400
          ? "warn"
          : "debug";
    logger[level]("[HTTP]", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
    });

    
    if (duration > 100) {
      logger.warn("[HTTP] Slow ingestion response — approaching 150ms target", {
        path: req.path,
        duration,
      });
    }
  });
  next();
});


app.use("/api/events", eventsRouter);


app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "fincart-event-gateway",
    timestamp: new Date().toISOString(),
  });
});


app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.path });
});




app.use((err, req, res, next) => {
  logger.error("[HTTP] Unhandled error in route", {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  
  const message = config.isProduction
    ? "An unexpected error occurred"
    : err.message;

  res.status(500).json({ error: "Internal Server Error", message });
});


async function start() {
  try {
    logger.info("[App] Starting Fincart Event Gateway...", { env: config.env });

    
    
    await connectMongo();
    logger.info("[App] MongoDB connected");

    
    getRedisClient();

    logger.info("[App] Redis connected");
    await warmupQueue();
    logger.info("[App] Queue warmed up");

    const server = app.listen(config.server.port, () => {
      logger.info(`[App] Listening on port ${config.server.port}`, {
        port: config.server.port,
        env: config.env,
      });
    });

    
    
    
    
    
    async function gracefulShutdown(signal) {
      logger.info(`[App] ${signal} received — starting graceful shutdown`);

      server.close(async () => {
        logger.info("[App] HTTP server closed");
        try {
          await closeMongo();
          await closeRedisClient();
          logger.info("[App] All connections closed. Goodbye.");
          process.exit(0);
        } catch (err) {
          logger.error("[App] Error during shutdown", { error: err.message });
          process.exit(1);
        }
      });

      
      setTimeout(() => {
        logger.error("[App] Forced shutdown after 30s timeout");
        process.exit(1);
      }, 30000);
    }

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    
    process.on("unhandledRejection", (reason, promise) => {
      logger.error("[App] Unhandled Promise Rejection", {
        reason: String(reason),
      });
      
      if (!config.isProduction) process.exit(1);
    });

    process.on("uncaughtException", (err) => {
      logger.error("[App] Uncaught Exception — shutting down", {
        error: err.message,
        stack: err.stack,
      });
      
      process.exit(1);
    });

    return server;
  } catch (err) {
    logger.error("[App] Failed to start", { error: err.message });
    process.exit(1);
  }
}

start();

module.exports = app; 
