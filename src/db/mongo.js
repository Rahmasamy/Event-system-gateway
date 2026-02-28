const mongoose = require("mongoose");
const config = require("../config");
const logger = require("../logs/logger");
const { Shipment } = require("../models/Shipment");
const { ProcessedEvent } = require("../models/ProcessEvents");
const { DLQEvent } = require("../models/DLQ");




let isConnected = false;

async function connectMongo() {
  if (isConnected) return;

  try {
    await mongoose.connect(config.mongo.uri, config.mongo.options);
    isConnected = true;
    logger.info("[MongoDB] Connected", { uri: config.mongo.uri });

    
    
    await Promise.all([
      Shipment.createIndexes(),
      ProcessedEvent.createIndexes(),
      DLQEvent.createIndexes(),
    ]);
    logger.info("[MongoDB] Indexes ensured");
  } catch (err) {
    logger.error("[MongoDB] Connection failed", { error: err.message });
    throw err; 
  }

  mongoose.connection.on("disconnected", () => {
    isConnected = false;
    logger.warn("[MongoDB] Disconnected — will auto-reconnect");
  });
  mongoose.connection.on("reconnected", () => {
    isConnected = true;
    logger.info("[MongoDB] Reconnected");
  });
  mongoose.connection.on("error", (err) => {
    logger.error("[MongoDB] Error", { error: err.message });
  });
}

async function closeMongo() {
  await mongoose.connection.close();
  isConnected = false;
  logger.info("[MongoDB] Connection closed gracefully");
}
module.exports = { connectMongo, closeMongo };
