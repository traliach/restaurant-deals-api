/**
 * Reset script — wipes orders and portal-created deals, keeps users and seed restaurants/deals.
 *
 * Run: npx ts-node src/scripts/reset.ts
 *
 * What it removes:
 *   - ALL orders (start fresh for testing)
 *   - Portal-created deals (restaurantSource not "seed") — drafts, submitted, rejected clutter
 *   - Expired seed deals (endAt in the past) and resets them to endAt = 7 days from now
 *
 * What it keeps:
 *   - All user accounts (admin, owners, customers)
 *   - All restaurants
 *   - Seed deals (republished with a fresh 7-day window)
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { DealModel } from "../models/Deal";
import { OrderModel } from "../models/Order";
import { NotificationModel } from "../models/Notification";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "";

function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

// Mirrors the expiry map from seed/enrich-yelp so reset reproduces the same variety.
const EXPIRY_BY_TITLE: Record<string, number> = {
  "Lunch Special":      4,
  "Chef's Daily Special": 4,
  "Happy Hour Bites":   6,
  "Family Dinner Pack": 48,
  "Family Feast Pack":  48,
  "Buy One Get One":    12,
  "Weekend Brunch Deal": 24,
};

async function reset() {
  await mongoose.connect(MONGO_URI);
  console.log("DB connected");

  // 1. Wipe all orders
  const { deletedCount: ordersDeleted } = await OrderModel.deleteMany({});
  console.log(`Orders deleted: ${ordersDeleted}`);

  // 2. Wipe all notifications (order/deal status noise)
  const { deletedCount: notifsDeleted } = await NotificationModel.deleteMany({});
  console.log(`Notifications deleted: ${notifsDeleted}`);

  // 3. Remove only portal-created deals (keep seed and yelp deals)
  const { deletedCount: portalDealsDeleted } = await DealModel.deleteMany({
    restaurantSource: { $nin: ["seed", "yelp"] },
  });
  console.log(`Portal deals deleted: ${portalDealsDeleted}`);

  // 4. Republish seed + Yelp deals with per-title expiry to restore realistic variety.
  const allDeals = await DealModel.find(
    { restaurantSource: { $in: ["seed", "yelp"] } },
    "_id title"
  );

  let refreshed = 0;
  for (const deal of allDeals) {
    const hours = EXPIRY_BY_TITLE[deal.title] ?? 24;
    await DealModel.updateOne(
      { _id: deal._id },
      { $set: { status: "PUBLISHED", endAt: hoursFromNow(hours) } }
    );
    refreshed++;
  }
  console.log(`Seed + Yelp deals refreshed: ${refreshed}`);

  console.log("\nReset complete. Clean state:");
  console.log("  - All orders cleared");
  console.log("  - All notifications cleared");
  console.log("  - Portal deals removed");
  console.log("  - Seed + Yelp deals republished with varied expiry (4h / 6h / 12h / 24h / 48h)");

  await mongoose.disconnect();
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
