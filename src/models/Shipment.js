const mongoose = require("mongoose");

const ShipmentSchema = new mongoose.Schema(
  {
    trackingNumber: { type: String, required: true, unique: true, index: true },
    merchantId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "active", "in_transit", "delivered", "cancelled", "exception"],
      default: "active",
    },
    carrier: { type: String },
    origin: { type: String },
    destination: { type: String },
    
    routingResult: { type: mongoose.Schema.Types.Mixed, default: null },
    lastEventAt: { type: Date },
  },
  { timestamps: true }
);

const Shipment = mongoose.model("Shipment", ShipmentSchema);
module.exports  = { Shipment };