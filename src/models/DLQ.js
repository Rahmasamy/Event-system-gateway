const mongoose = require("mongoose");

const DLQEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, index: true },
    jobId: { type: String },
    eventType: { type: String },
    payload: { type: mongoose.Schema.Types.Mixed },
    
    lastError: { type: String },
    failedAt: { type: Date, default: Date.now },
    
    totalAttempts: { type: Number },
    
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    resolvedBy: { type: String },
  },
  { timestamps: true }
);

const DLQEvent = mongoose.model("DLQEvent", DLQEventSchema);

module.exports = { DLQEvent };