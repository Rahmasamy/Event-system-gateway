"use strict";

const { createLogger, format, transports } = require("winston");
const config = require(".");

const devFormat = format.combine(
  format.colorize(),
  format.timestamp({
    format: "HH:mm:ss",
  }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? "\n" + JSON.stringify(meta, null, 2)
      : "";
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  }),
);

const prodFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.json(),
);
const logger = createLogger({
  level: config.isProduction ? "info" : "debug",
  format: config.isProduction ? prodFormat : devFormat,
  transports: [
    new transports.Console(),
    new transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 10 * 1024 * 1024, 
      maxFiles: 5,
      tailable: true,
    }),
     new transports.File({
      filename: "logs/combined.log",
      maxsize: 20 * 1024 * 1024,
      maxFiles: 10,
      tailable: true,
    }),
  ],
    exitOnError: false,
});
module.exports = logger;