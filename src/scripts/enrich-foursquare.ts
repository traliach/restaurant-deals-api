/**
 * Foursquare enrichment script.
 * Updates seeded restaurants with real data: address, city, lat/lng, rating, website, photo.
 * Also updates associated deals with new restaurantAddress and restaurantCity.
 *
 * Run: npx ts-node src/scripts/enrich-foursquare.ts
 * Safe to re-run — only updates restaurants that have a foursquareId NOT already set.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import { DealModel } from "../models/Deal";
import { RestaurantModel } from "../models/Restaurant";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "";
const FOURSQUARE_KEY = process.env.FOURSQUARE_API_KEY || "";

type FoursquarePlace = {
  fsq_id: string;
  name: string;
  location?: {
    formatted_address?: string;
    locality?: string;
    address?: string;
  };
  geocodes?: { main?: { latitude: number; longitude: number } };
  photos?: { prefix: string; suffix: string }[];
  rating?: number;
  website?: string;
};

async function searchFoursquare(query: string, near: string): Promise<FoursquarePlace | null> {
  const params = new URLSearchParams({
    query,
    near,
    limit: "1",
    fields: "fsq_id,name,location,geocodes,photos,rating,website",
  });

  const res = await fetch(
    `https://api.foursquare.com/v3/places/search?${params.toString()}`,
    {
      headers: {
        Authorization: FOURSQUARE_KEY,
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    return null;
  }

  const data = await res.json() as { results?: FoursquarePlace[] };
  return data.results?.[0] ?? null;
}

async function enrich() {
  if (!FOURSQUARE_KEY) {
    console.error("FOURSQUARE_API_KEY is not set in .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log("DB connected\n");

  // Only enrich restaurants not yet enriched.
  const restaurants = await RestaurantModel.find({ foursquareId: { $exists: false } });
  console.log(`Found ${restaurants.length} restaurants to enrich\n`);

  let enriched = 0;
  let skipped = 0;

  for (const restaurant of restaurants) {
    // Rate limit — Foursquare free tier: 1 req/sec.
    await new Promise((r) => setTimeout(r, 1100));

    const place = await searchFoursquare(restaurant.name, restaurant.city ?? "New York");

    if (!place) {
      console.log(`  ✗ Not found: ${restaurant.name} (${restaurant.city})`);
      skipped++;
      continue;
    }

    const photo = place.photos?.[0];
    const photoUrl = photo ? `${photo.prefix}800x450${photo.suffix}` : undefined;
    const address = place.location?.formatted_address ?? place.location?.address ?? restaurant.address;
    const city = place.location?.locality ?? restaurant.city;

    // Update the Restaurant document.
    await RestaurantModel.updateOne(
      { _id: restaurant._id },
      {
        foursquareId: place.fsq_id,
        address,
        city,
        latitude: place.geocodes?.main?.latitude,
        longitude: place.geocodes?.main?.longitude,
        rating: place.rating,
        website: place.website,
        ...(photoUrl ? { imageUrl: photoUrl } : {}),
      }
    );

    // Propagate address/city to all deals for this restaurant.
    await DealModel.updateMany(
      { restaurantId: restaurant.restaurantId },
      {
        restaurantAddress: address,
        restaurantCity: city,
        ...(photoUrl ? { imageUrl: photoUrl } : {}),
      }
    );

    console.log(`  ✓ ${restaurant.name} → ${place.name} (${city}) rating:${place.rating ?? "n/a"}`);
    enriched++;
  }

  console.log(`\nEnrichment complete:`);
  console.log(`  Enriched: ${enriched}`);
  console.log(`  Not found: ${skipped}`);

  await mongoose.disconnect();
}

enrich().catch((err) => {
  console.error("Enrichment failed:", err);
  process.exit(1);
});
