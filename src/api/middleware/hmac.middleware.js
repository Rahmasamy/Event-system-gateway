const crypto = require("crypto");
const config = require("../../config");
const { SIGNATURE_HEADER, SIGNATURE_PREFIX } = require("../../consts/HmacSignature");
const logger = require("../../logs/logger");

function validateHmacSignature(req, res, next) {
  const signature = req.headers[SIGNATURE_HEADER];

  if (!signature) {
    logger.warn("[HMAC] Missing signature header", {
      ip: req.ip,
      path: req.path,
    });
    return res.status(401).json({ error: "Missing HMAC signature" });
  }
  if (!signature.startsWith(SIGNATURE_PREFIX)) {
    logger.warn("[HMAC] Invalid signature format", { header: signature });
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid signature format",
    });
  }
  if (!req.rawBody) {
    logger.error(
      "[HMAC] Raw body not available — check app.js middleware order",
    );
    return res.status(500).json({ error: "Internal server error" });
  }

  try {
    const receivedSignature = signature.slice(SIGNATURE_PREFIX.length);
    const expectedSignature = crypto
      .createHmac("sha256", config.security.hmacSecret)
      .update(req.rawBody)
      .digest("hex");
    const receivedBuf = Buffer.from(receivedSignature, "hex");
    const expectedBuf = Buffer.from(expectedSignature, "hex");
    if (
      receivedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(receivedBuf, expectedBuf)
    ) {
      logger.warn(
        "[HMAC] Signature mismatch — potential tampering or wrong secret",
        {
          ip: req.ip,
          path: req.path,
        },
      );
      return res.status(401).json({
        error: "Unauthorized",
        message: "Signature validation failed",
      });
    }
    logger.debug("[HMAC] Signature valid", { path: req.path });

    next();
  } catch (err) {
    logger.error("[HMAC] Validation error", { error: err.message });
    return res.status(500).json({ error: "Internal server error" });
  }
}
module.exports = { validateHmacSignature };
