"use strict";

const { Router } = require("express");

const { validateHmacSignature } = require("../../api/middleware/hmac.middleware");
const { idempotencyCheck } = require("../../api/middleware/idempotency.middleware");
const {
  postEvent,
  getHealth,
  getDLQ,
  postDLQReprocess,
} = require("./events.controller");


const router = Router();


router.post("/", validateHmacSignature, idempotencyCheck, postEvent);


router.get("/health", getHealth);


router.get("/dlq", getDLQ);


router.post("/dlq/reprocess/:eventId", postDLQReprocess);

module.exports = router;
