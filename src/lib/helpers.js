
"use strict";

function get(key, defaultValue, required = true) {
  const value = process.env[key] ?? defaultValue;
  if (required && (value === undefined || value === "")) {
    throw new Error(`[Config] Missing required environment variable: ${key}`);
  }
  return value;
}

 function getInt(key, defaultValue) {
  const val = parseInt(process.env[key] ?? defaultValue, 10);
  if (isNaN(val)) throw new Error(`[Config] ${key} must be an integer`);
  return val;
}
module.exports = { get, getInt };

