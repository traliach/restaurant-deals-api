/**
 * One-time backfill script — adds cuisineType, dietaryTags, and yelpRating
 * to all seed restaurants and deals that are missing them.
 *
 * Run: npx ts-node src/scripts/patch-cuisine.ts
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { DealModel } from "../models/Deal";
import { RestaurantModel } from "../models/Restaurant";

dotenv.config();

// ─── Cuisine mapping (by restaurant name) ─────────────────────────────────────

const CUISINE: Record<string, "French" | "Italian" | "Spanish" | "American" | "Asian" | "Mexican" | "Mediterranean" | "Other"> = {
  "Ironbound Steakhouse": "American",
  "Ferry St Tapas":       "Spanish",
  "Seabra's Marisqueira": "Spanish",
  "Porto's Kitchen":      "Spanish",
  "Brasilia Grill":       "Other",

  "Skinner's Loft":       "American",
  "Light Horse Tavern":   "American",
  "Taqueria Downtown":    "Mexican",
  "Satis Bistro":         "French",
  "Porta Pizza":          "Italian",

  "The NoMad Bar":        "American",
  "Balthazar Brasserie":  "French",
  "Superiority Burger":   "American",
  "Ivan Ramen":           "Asian",
  "Xi'an Famous Foods":   "Asian",

  "Lucali Pizza":         "Italian",
  "Di Fara Pizza":        "Italian",
  "Roberta's":            "Italian",
  "Olmsted":              "American",
  "The River Café":       "American",

  "Antique Bar & Bakery": "American",
  "Amanda's Restaurant":  "American",
  "Bwe Kafe":             "Other",
  "Leo's Grandevous":     "American",
  "Bin 14":               "American",

  "Pig & Prince":         "American",
  "Raymond's":            "American",
  "Halcyon":              "American",
  "Fascino":              "Italian",
  "Fresco Il Ristorante": "Italian",
};

// ─── Dietary tags mapping (by restaurant name) ────────────────────────────────

type DietaryTag = "Vegan" | "Vegetarian" | "Gluten-Free" | "Halal" | "Keto" | "Dairy-Free";

const DIETARY: Record<string, DietaryTag[]> = {
  "Superiority Burger":   ["Vegan", "Vegetarian"],
  "Ivan Ramen":           ["Vegetarian"],
  "Xi'an Famous Foods":   ["Halal"],
  "Olmsted":              ["Vegan", "Gluten-Free"],
  "Bwe Kafe":             ["Vegan", "Vegetarian"],
  "Seabra's Marisqueira": ["Gluten-Free"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Random rating between 3.5 and 5.0, one decimal place. */
function randRating5() {
  return Math.round((3.5 + Math.random() * 1.5) * 10) / 10;
}

/** Random rating between 7.0 and 9.5, one decimal place (Restaurant.rating is 0-10). */
function randRating10() {
  return Math.round((7.0 + Math.random() * 2.5) * 10) / 10;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function patch() {
  await mongoose.connect(process.env.MONGO_URI || "");
  console.log("DB connected\n");

  let restaurantHit = 0;
  let dealHit = 0;

  for (const [name, cuisineType] of Object.entries(CUISINE)) {
    const dietaryTags: DietaryTag[] = DIETARY[name] ?? [];

    // Update restaurants missing cuisineType
    const rRes = await RestaurantModel.updateMany(
      { name, cuisineType: { $exists: false } },
      { $set: { cuisineType, rating: randRating10() } }
    );
    restaurantHit += rRes.modifiedCount;

    // Update deals missing cuisineType
    const dRes = await DealModel.updateMany(
      { restaurantName: name, cuisineType: { $exists: false } },
      { $set: { cuisineType, dietaryTags, yelpRating: randRating5() } }
    );
    dealHit += dRes.modifiedCount;
  }

  // Reset endAt = now + 24h on every PUBLISHED deal so they are live for one day
  const expireRes = await DealModel.updateMany(
    { status: "PUBLISHED" },
    { $set: { endAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } }
  );

  // Backfill yelpRating on any deal still missing it (e.g. Yelp-enriched deals
  // that were imported before yelpRating was added to the enrich script).
  const allMissingRating = await DealModel.find(
    { yelpRating: { $exists: false } },
    "_id"
  ).lean();
  const ratingOps = allMissingRating.map((d) => ({
    updateOne: {
      filter: { _id: d._id },
      update: { $set: { yelpRating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10 } },
    },
  }));
  let ratingHit = 0;
  if (ratingOps.length > 0) {
    const ratingRes = await DealModel.bulkWrite(ratingOps);
    ratingHit = ratingRes.modifiedCount;
  }

  console.log(`Restaurants updated : ${restaurantHit}`);
  console.log(`Deals updated       : ${dealHit}`);
  console.log(`Deals endAt reset   : ${expireRes.modifiedCount}`);
  console.log(`Deals rating filled : ${ratingHit}`);

  await mongoose.disconnect();
  console.log("\nDone.");
}

patch().catch((err) => {
  console.error("Patch failed:", err);
  process.exit(1);
});
