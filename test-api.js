const http = require("http");
const crypto = require("crypto");

const payload = {
  eventId: "test-1",
  eventType: "shipped",
  trackingNumber: "TRK123",
};

const body = JSON.stringify(payload);
const secret = "dev-secret-key-fincart-2024";
const signature = "sha256=" + crypto
  .createHmac("sha256", secret)
  .update(Buffer.from(body))
  .digest("hex");

const options = {
  hostname: "localhost",
  port: 3000,
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
  res.on("data", (chunk) => {
    data += chunk;
  });
  res.on("end", () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Response: ${data}`);
  });
});

req.on("error", (error) => {
  console.error("Error:", error.message);
  console.error("Stack:", error.stack);
});

req.write(body);
req.end();
