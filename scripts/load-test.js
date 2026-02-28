#!/usr/bin/env node
"use strict";











const crypto = require("crypto");
const http = require("http");

const CONFIG = {
  host: "localhost",
  port: process.env.PORT || 3000,
  hmacSecret: process.env.HMAC_SECRET || "dev-secret-key-fincart-2024",
  totalRequests: 100,
  
  
  batchSize: 100,
};

const EVENT_TYPES = [
  "shipment_created",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "delivery_exception",
];



function generateTrackingNumber() {
  return `TRK${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
}

function buildEventPayload(index) {
  return {
    eventId: `load-test-${Date.now()}-${index}`,
    eventType: EVENT_TYPES[index % EVENT_TYPES.length],
    trackingNumber: `TRK-LOAD-${String(index).padStart(4, "0")}`,
    carrier: "test-carrier",
    timestamp: new Date().toISOString(),
    metadata: {
      origin: "test-load-generator",
      testIndex: index,
    },
  };
}

function signPayload(body) {
  return (
    "sha256=" +
    crypto
      .createHmac("sha256", CONFIG.hmacSecret)
      .update(Buffer.from(body))
      .digest("hex")
  );
}

function sendRequest(payload, index) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const signature = signPayload(body);
    const start = Date.now();

    const options = {
      hostname: CONFIG.host,
      port: CONFIG.port,
      path: "/api/events",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "X-Fincart-Signature": signature,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const duration = Date.now() - start;
        resolve({
          index,
          status: res.statusCode,
          duration,
          success: res.statusCode === 202,
          body: data,
        });
      });
    });

    req.on("error", (err) => {
      const duration = Date.now() - start;
      resolve({
        index,
        status: 0,
        duration,
        success: false,
        error: err.message,
      });
    });

    
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({
        index,
        status: 0,
        duration: 5000,
        success: false,
        error: "Request timeout",
      });
    });

    req.write(body);
    req.end();
  });
}



async function runLoadTest() {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  FINCART EVENT GATEWAY — LOAD TEST");
  console.log(`  Target: ${CONFIG.totalRequests} concurrent requests`);
  console.log(`  Endpoint: http://${CONFIG.host}:${CONFIG.port}/api/events`);
  console.log("════════════════════════════════════════════════════════════\n");
  console.log("Starting load test...\n");
  const payloads = Array.from({ length: CONFIG.totalRequests }, (_, i) =>
    buildEventPayload(i)
  );

  console.log(`[${new Date().toISOString()}] Firing ${CONFIG.totalRequests} concurrent requests...`);
  const testStart = Date.now();

  
  const results = await Promise.all(
    payloads.map((payload, i) => sendRequest(payload, i))
  );

  const totalDuration = Date.now() - testStart;

  
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const durations = results.map((r) => r.duration);
  const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const maxDuration = Math.max(...durations);
  const minDuration = Math.min(...durations);
  const p99Duration = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.99)];
  const under150ms = results.filter((r) => r.duration < 150).length;

  console.log("\n── RESULTS ──────────────────────────────────────────────────");
  console.log(`  Total requests:    ${CONFIG.totalRequests}`);
  console.log(`  ✓ Successful:      ${successful.length}`);
  console.log(`  ✗ Failed:          ${failed.length}`);
  console.log(`  Total wall time:   ${totalDuration}ms`);
  console.log("\n── LATENCY ──────────────────────────────────────────────────");
  console.log(`  Min:               ${minDuration}ms`);
  console.log(`  Avg:               ${avgDuration}ms`);
  console.log(`  Max:               ${maxDuration}ms`);
  console.log(`  P99:               ${p99Duration}ms`);
  console.log(`  Under 150ms:       ${under150ms}/${CONFIG.totalRequests}`);
  console.log("────────────────────────────────────────────────────────────");

  if (failed.length > 0) {
    console.log("\n── FAILURES ─────────────────────────────────────────────────");
    failed.slice(0, 10).forEach((f) => {
      console.log(`  Request #${f.index}: status=${f.status}, error=${f.error || "unknown"}`);
    });
    if (failed.length > 10) {
      console.log(`  ... and ${failed.length - 10} more`);
    }
  }

  const passedTargetLatency = under150ms === CONFIG.totalRequests;
  const passedZeroFailures = failed.length === 0;

  console.log("\n── ASSESSMENT ───────────────────────────────────────────────");
  console.log(`  Zero failures:     ${passedZeroFailures ? "✓ PASS" : "✗ FAIL"}`);
  console.log(`  All < 150ms:       ${passedTargetLatency ? "✓ PASS" : `⚠ ${under150ms}/${CONFIG.totalRequests} met target`}`);
  console.log("════════════════════════════════════════════════════════════\n");

  process.exit(passedZeroFailures ? 0 : 1);
}

runLoadTest().catch((err) => {
  console.error("Load test crashed:", err);
  process.exit(1);
});