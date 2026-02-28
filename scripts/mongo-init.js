


db = db.getSiblingDB("fincart_gateway");


db.shipments.createIndex({ trackingNumber: 1 }, { unique: true });
db.shipments.createIndex({ merchantId: 1 });
db.processdevents.createIndex({ eventId: 1 }, { unique: true });
db.processdevents.createIndex({ processedAt: 1 }, { expireAfterSeconds: 2592000 });
db.dlqevents.createIndex({ eventId: 1 });
db.dlqevents.createIndex({ resolved: 1 });



const shipments = [];
for (let i = 0; i < 200; i++) {
  const paddedIndex = String(i).padStart(4, "0");
  shipments.push({
    trackingNumber: `TRK-LOAD-${paddedIndex}`,
    merchantId: `merchant-${(i % 10) + 1}`,
    status: "active",
    carrier: i % 2 === 0 ? "fedex" : "dhl",
    origin: "Cairo, EG",
    destination: "Alexandria, EG",
    routingResult: null,
    lastEventAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

db.shipments.insertMany(shipments);
print(`✓ Seeded ${shipments.length} shipments`);