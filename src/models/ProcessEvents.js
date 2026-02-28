const mongoose = require("mongoose");

const ProcessedEventSchema = new mongoose.Schema(
  {
    
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true },
    trackingNumber: { type: String, index: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    routingResult: { type: mongoose.Schema.Types.Mixed },
    processedAt: { type: Date, default: Date.now },
    
    attemptsMade: { type: Number, default: 1 },
  },
  {
    
    
    timeseries: false,
  }
);


ProcessedEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 2592000 })

const ProcessedEvent = mongoose.model("ProcessedEvent", ProcessedEventSchema);
module.exports = { ProcessedEvent };