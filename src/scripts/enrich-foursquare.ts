/**
 * Foursquare enrichment script — Option C architecture.
 *
 * 1. Tags all existing seeded restaurants/deals with source="seed" (migration).
 * 2. For each city, searches Foursquare for real restaurants.
 * 3. Creates new Restaurant documents (source="foursquare") and 5 published Deals each.
 * Idempotent — skips cities that already have foursquare restaurants.
 *
 * Run: npx ts-node src/scripts/enrich-foursquare.ts
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { DealModel } from "../models/Deal";
import { RestaurantModel } from "../models/Restaurant";
import { UserModel } from "../models/User";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "";
const FOURSQUARE_KEY = process.env.FOURSQUARE_API_KEY || "";

const CITIES = [
  { city: "Newark", near: "Newark, NJ" },
  { city: "Jersey City", near: "Jersey City, NJ" },
  { city: "New York", near: "New York, NY" },
  { city: "Brooklyn", near: "Brooklyn, NY" },
  { city: "Hoboken", near: "Hoboken, NJ" },
  { city: "Montclair", near: "Montclair, NJ" },
];

const DEAL_TEMPLATES = [
  { title: "Chef's Daily Special", description: "Fresh seasonal ingredients prepared by our head chef. Available daily until sold out.", dealType: "Lunch" as const, discountType: "percent" as const, value: 20, price: 16.99 },
  { title: "Happy Hour Bites", description: "Half-price appetizers every weekday 4–7pm. Perfect for after-work gatherings.", dealType: "Carryout" as const, discountType: "amount" as const, value: 8, price: 22.00 },
  { title: "Family Feast Pack", description: "Feeds a family of four. Two entrees, sides, and a shared dessert. Order ahead.", dealType: "Carryout" as const, discountType: "percent" as const, value: 15, price: 59.99 },
  { title: "Buy One Get One", description: "Order any entrée and receive a second of equal or lesser value free.", dealType: "Delivery" as const, discountType: "bogo" as const, value: 0, price: 19.50 },
  { title: "Weekend Brunch Deal", description: "Bottomless coffee and juice included with any brunch plate Saturday and Sunday.", dealType: "Other" as const, discountType: "amount" as const, value: 10, price: 28.00 },
];

type FoursquarePlace = {
  fsq_place_id: string;
  name: string;
  location?: { formatted_address?: string; locality?: string };
  latitude?: number;
  longitude?: number;
  photos?: { prefix: string; suffix: string }[];
  rating?: number;
  website?: string;
  tel?: string;
};

async function searchFoursquare(near: string, limit = 5): Promise<FoursquarePlace[]> {
  const params = new URLSearchParams({
    query: "restaurant",
    near,
    limit: String(limit),
    fields: "fsq_id,name,location,geocodes,photos,rating,website,tel",
  });

  const res = await fetch(
    `https://places-api.foursquare.com/places/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${FOURSQUARE_KEY}`,
        Accept: "application/json",
        "X-Places-Api-Version": "2025-06-17",
      },
    }
  );

  if (!res.ok) {
    console.log(`  Foursquare error for ${near}: ${res.status}`);
    return [];
  }

  const data = await res.json() as { results?: FoursquarePlace[] };
  return data.results ?? [];
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function enrich() {
  if (!FOURSQUARE_KEY) {
    console.error("FOURSQUARE_API_KEY is not set in .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("DB connected\n");

  // ── Step 1: Tag all existing seed data ──────────────────────────────────────
  const seedRestaurantUpdate = await RestaurantModel.updateMany(
    { source: { $exists: false } },
    { source: "seed" }
  );
  const seedDealUpdate = await DealModel.updateMany(
    { restaurantSource: { $exists: false } },
    { restaurantSource: "seed" }
  );
  console.log(`Migration: tagged ${seedRestaurantUpdate.modifiedCount} restaurants and ${seedDealUpdate.modifiedCount} deals as source=seed\n`);

  // Find a foursquare owner account to attribute deals to (or use admin).
  const adminUser = await UserModel.findOne({ role: "admin" });
  if (!adminUser) {
    console.error("No admin user found — run seed.ts first");
    await mongoose.disconnect();
    process.exit(1);
  }

  let totalRestaurants = 0;
  let totalDeals = 0;

  // ── Step 2: Import real restaurants per city ─────────────────────────────────
  for (const { city, near } of CITIES) {
    const existing = await RestaurantModel.countDocuments({ city, source: "foursquare" });
    if (existing > 0) {
      console.log(`Skipping ${city} — already enriched (${existing} restaurants)`);
      continue;
    }

    console.log(`Fetching restaurants near ${near}...`);
    // Rate limit — 1 req/sec for free tier.
    await new Promise((r) => setTimeout(r, 1100));

    const places = await searchFoursquare(near, 5);
    if (places.length === 0) {
      console.log(`  No results for ${near}`);
      continue;
    }

    for (const place of places) {
      // Skip if this Foursquare place is already imported.
      const exists = await RestaurantModel.findOne({ foursquareId: place.fsq_place_id });
      if (exists) {
        console.log(`  Skipping duplicate: ${place.name}`);
        continue;
      }

      const photo = place.photos?.[0];
      const photoUrl = photo ? `${photo.prefix}800x450${photo.suffix}` : undefined;
      const address = place.location?.formatted_address ?? "";
      const restaurantId = `fsq-${place.fsq_place_id}`;

      const restaurant = await RestaurantModel.create({
        restaurantId,
        name: place.name,
        ownerId: adminUser._id,
        source: "foursquare",
        foursquareId: place.fsq_place_id,
        description: `${place.name} is a real restaurant imported from Foursquare Places.`,
        address,
        city,
        latitude: place.latitude,
        longitude: place.longitude,
        phone: place.tel,
        website: place.website,
        rating: place.rating,
        imageUrl: photoUrl,
      });
      totalRestaurants++;

      // Create 5 deals for this real restaurant.
      for (const tmpl of DEAL_TEMPLATES) {
        await DealModel.create({
          restaurantId,
          restaurantName: place.name,
          restaurantAddress: address,
          restaurantCity: city,
          restaurantSource: "foursquare",
          title: tmpl.title,
          description: tmpl.description,
          dealType: tmpl.dealType,
          discountType: tmpl.discountType,
          value: tmpl.value,
          price: tmpl.price,
          imageUrl: photoUrl,
          status: "PUBLISHED",
          createdByUserId: adminUser._id,
          startAt: new Date(),
          endAt: daysFromNow(30),
        });
        totalDeals++;
      }

      console.log(`  ✓ ${place.name} (${city}) id:${place.fsq_place_id} rating:${place.rating ?? "n/a"}`);
    }
  }

  console.log(`\nEnrichment complete:`);
  console.log(`  Restaurants imported: ${totalRestaurants}`);
  console.log(`  Deals created:        ${totalDeals}`);

  await mongoose.disconnect();
}

enrich().catch((err) => {
  console.error("Enrichment failed:", err);
  process.exit(1);
});
